import { Router } from "express";
import { readDeviceCredentials } from "../lib/device-credentials.js";
import { fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { createPublicClient, createServiceClient } from "../lib/supabase.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { librarySummaryQuerySchema, libraryVisitBatchSchema, libraryVisitSchema } from "../schemas/library.js";

export const libraryDeviceRouter = Router();
libraryDeviceRouter.post("/visits", validate({ body: libraryVisitSchema }), asyncHandler(async (req, res) => {
  const credential = readDeviceCredentials(req);
  const { data, error } = await createPublicClient().rpc("ingest_library_visit", {
    target_device_id: credential.deviceId, device_secret: credential.secret, visit_event_id: req.body.event_id,
    visit_card_uid: req.body.card_uid, visit_occurred_at: req.body.occurred_at,
    visit_local_sequence: req.body.local_sequence, visit_source: "REALTIME", visit_metadata: req.body.metadata
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data, data?.duplicate ? 200 : 201);
}));
libraryDeviceRouter.post("/visits/sync", validate({ body: libraryVisitBatchSchema }), asyncHandler(async (req, res) => {
  const credential = readDeviceCredentials(req);
  const events = [...req.body.events].sort((a, b) => a.local_sequence - b.local_sequence);
  const { data, error } = await createPublicClient().rpc("sync_library_visits", {
    target_device_id: credential.deviceId, device_secret: credential.secret, visit_events: events
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

export const libraryRouter = Router();
libraryRouter.get("/summary", requirePermission("library.read"), validate({ query: librarySummaryQuerySchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("report_library_summary", { p_school: req.tenant!.schoolId, p_from: req.query.occurred_from ?? null, p_to: req.query.occurred_to ?? null });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

// Staff PWA uses its own user-scoped permission; device routes remain unchanged.
libraryRouter.post("/visits", requirePermission("library.visit"), validate({ body: libraryVisitSchema }), asyncHandler(async (req, res) => {
  let finalCardUid = req.body.card_uid;

  // Transparently resolve NISN or Student Number to the corresponding active card's qr_key.
  // This workaround is needed because the printed QR code sometimes encodes the NISN,
  // but record_portal_library_visit strictly requires the card's qr_key or NFC card_uid.
  if (/^[a-zA-Z0-9]+$/.test(finalCardUid)) {
    const admin = createServiceClient();
    const { data: student } = await admin.from("students")
      .select("id")
      .eq("school_id", req.tenant!.schoolId)
      .or(`nisn.eq.${finalCardUid},student_number.eq.${finalCardUid}`)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (student) {
      const { data: card } = await admin.from("student_cards")
        .select("qr_key")
        .eq("school_id", req.tenant!.schoolId)
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (card) {
        finalCardUid = card.qr_key;
      }
    }
  }

  const { data, error } = await req.auth!.client.rpc("record_portal_library_visit", {
    target_school_id: req.tenant!.schoolId, p_event_id: req.body.event_id, p_card_uid: finalCardUid,
    p_occurred_at: req.body.occurred_at, p_local_sequence: req.body.local_sequence
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data, data?.duplicate ? 200 : 201);
}));
