import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import sharp from "sharp";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createServiceClient } from "../lib/supabase.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, requireTenant } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { claimParentPermitSchema, linkChildByNisnDobSchema } from "../schemas/parent.js";
import { parentSessionRouter, parentCookieAuth } from "./parent-session.js";
import { processStudentPhotoWorker, dataUrlToBuffer } from "../services/photo-processor.js";

const router = Router();
router.use("/session", parentSessionRouter);
router.use(parentCookieAuth);

router.post("/attachments", requireAuth, asyncHandler(async (req, res) => {
  const parsed = z.object({ student_id: z.uuid(), photo_data: z.string().max(3_000_000) }).strict().safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_ERROR", "Lampiran JPEG/PNG maksimal 2 MiB diperlukan.");
  const { data: allowed, error: accessError } = await req.auth!.client.rpc("can_access_parent_child", { p_student_id: parsed.data.student_id });
  if (accessError) throw fromDatabaseError(accessError);
  if (!allowed) throw new ApiError(403, "FORBIDDEN", "Hubungan anak tidak valid.");
  let jpeg: Buffer;
  try { jpeg = await sharp(dataUrlToBuffer(parsed.data.photo_data), {limitInputPixels:20_000_000}).rotate().resize({width:2000,height:2000,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer(); }
  catch { throw new ApiError(422, "VALIDATION_ERROR", "Lampiran tidak dapat dibaca."); }
  const { data, error } = await req.auth!.client.rpc("store_parent_permit_attachment", { p_student_id: parsed.data.student_id, p_jpeg: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
  if (error) throw fromDatabaseError(error);
  sendData(res, { reference: `attachment:${data}` }, 201);
}));

router.post("/permits", requireAuth, validate({ body: claimParentPermitSchema }), asyncHandler(async (req, res) => {
  const { student_id, permit_date, reason, notes, attachment_url } = req.body as {
    student_id: string;
    permit_date: string;
    reason: string;
    notes?: string;
    attachment_url?: string;
  };

  const { data, error } = await req.auth!.client.rpc("submit_student_absence_permit", {
    p_student_id: student_id,
    p_permit_date: permit_date,
    p_reason: reason,
    p_notes: notes ?? "",
    p_attachment_url: attachment_url ?? null
  });

  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.post("/link", requireAuth, validate({ body: linkChildByNisnDobSchema }), asyncHandler(async (req, res) => {
  const { nisn, date_of_birth } = req.body;
  const { data, error } = await req.auth!.client.rpc("link_child_by_nisn_dob", {
    p_nisn: nisn,
    p_dob: date_of_birth
  });
  if (error) throw fromDatabaseError(error);
  if (!data?.accepted) {
    if (data?.code === "RATE_LIMITED") {
      throw new ApiError(429, "RATE_LIMITED", data?.message || "Terlalu banyak percobaan gagal. Silakan coba kembali dalam 15 menit.");
    }
    throw new ApiError(404, data?.code || "STUDENT_NOT_FOUND", data?.message || "Data siswa dengan NISN dan tanggal lahir tersebut tidak ditemukan.");
  }
  sendData(res, data, 201);
}));

router.get("/profile", requireAuth, asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client
    .from("parent_profiles")
    .select("full_name")
    .eq("user_id", req.auth!.user.id)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? { full_name: null });
}));

router.get("/children", requireAuth, asyncHandler(async (req, res) => {

  const { data, error } = await req.auth!.client.rpc("get_verified_parent_children");
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.get("/children/:id/today", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {

  const { data, error } = await req.auth!.client.rpc("get_verified_parent_child_today", { target_student_id: req.params.id });
  if (error?.code === "AP002") throw new ApiError(404, "CHILD_NOT_LINKED", "Child relationship was not found");
  if (error) throw fromDatabaseError(error);

  const payload = data as Record<string, any>;
  if (payload && (!payload.library?.active_loans || !Array.isArray(payload.library.active_loans))) {
    try {
      const admin = createServiceClient();
      const { data: loans } = await admin
        .from("library_loans")
        .select("id,book_title,book_author,borrowed_at,due_date")
        .eq("student_id", req.params.id)
        .is("returned_at", null)
        .order("due_date", { ascending: true });
      if (loans) {
        const tz = payload.timezone || "Asia/Makassar";
        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        payload.library = {
          ...payload.library,
          active_loans: loans.map((l: any) => ({
            ...l,
            is_overdue: l.due_date < todayStr,
          })),
        };
      }
    } catch {
      /* Retain existing payload if loan lookup cannot proceed */
    }
  }

  sendData(res, payload);
}));

router.post("/children/:id/photo", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { photo_url } = req.body as { photo_url: string };
  if (!photo_url || typeof photo_url !== "string" || !photo_url.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Photo data is required");
  }

  const { data: allowed, error: accessError } = await req.auth!.client.rpc("can_access_parent_child", { p_student_id: req.params.id });
  if (accessError) throw fromDatabaseError(accessError);
  if (!allowed) throw new ApiError(403, "FORBIDDEN", "Hubungan anak belum terverifikasi atau telah dicabut.");

  // Worker pipeline server-side: Photoroom (bg + relighting) / Clipdrop + sharp / foto asli
  const processed = await processStudentPhotoWorker(photo_url.trim());

  const { data, error } = await req.auth!.client.rpc("update_student_photo_by_parent", {
    p_student_id: req.params.id,
    p_photo_data: processed.dataUrl
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, { result: data, photo_provider: processed.provider }, 200);
}));

// School-admin recovery tools are scoped before using the service client.
router.get("/guardians", requireAuth, requireTenant,
  validate({ query: z.object({ student_id: z.uuid() }).strict() }), asyncHandler(async (req, res) => {
    const school = req.tenant!.schoolId;
    const { data: allowed, error: permissionError } = await req.auth!.client.rpc("can_manage_portal_access", { target_school_id: school });
    if (permissionError) throw fromDatabaseError(permissionError);
    if (!allowed) throw new ApiError(403, "FORBIDDEN", "Admin sekolah diperlukan.");
    const admin = createServiceClient();
    const { data: links, error } = await admin.from("parent_student_links").select("parent_user_id").eq("school_id", school).eq("student_id", req.query.student_id).eq("status", "ACTIVE").not("verified_at", "is", null);
    if (error) throw fromDatabaseError(error);
    const ids = (links ?? []).map(link => link.parent_user_id);
    if (!ids.length) { sendData(res, []); return; }
    const { data: identities, error: identityError } = await admin.from("parent_portal_identities").select("user_id,phone,parent_profiles(full_name)").eq("school_id", school).in("user_id", ids);
    if (identityError) throw fromDatabaseError(identityError);
    sendData(res, identities ?? []);
  }));
router.post("/recovery-tokens", requireAuth, requireTenant,
  validate({ body: z.object({ user_id: z.uuid() }).strict() }), asyncHandler(async (req, res) => {
    const token = randomBytes(32).toString("hex");
    const { data: expires_at, error } = await req.auth!.client.rpc("issue_parent_recovery", { p_school: req.tenant!.schoolId, p_user: req.body.user_id, p_hash: createHash("sha256").update(token).digest("hex") });
    if (error) throw fromDatabaseError(error);
    sendData(res, { token, expires_at }, 201);
  }));


export { router as parentsRouter };
