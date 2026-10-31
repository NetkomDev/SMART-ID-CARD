import type { Request } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "./errors.js";
export const studentIdentitySchema = z
  .object({
    identity: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9:_-]{4,128}$/),
  })
  .strict();
export async function resolvePortalStudent(
  req: Request,
  identity: string,
): Promise<{
  id: string;
  full_name: string;
  photo_url?: string | null;
  student_number?: string;
  nisn?: string | null;
}> {
  const school = req.tenant!.schoolId;
  // Manual numbers do not require a physical card; QR/NFC codes still use the card authorization RPC.
  if (/^\d{4,20}$/.test(identity)) {
    const { data, error } = await req
      .auth!.client.from("students")
      .select("id,full_name,photo_url,student_number,nisn")
      .eq("school_id", school)
      .eq("is_active", true)
      .is("deleted_at", null)
      .or(`nisn.eq.${identity},student_number.eq.${identity}`)
      .limit(2);
    if (error) throw fromDatabaseError(error);
    if (data && data.length > 1)
      throw new ApiError(
        422,
        "STUDENT_NOT_FOUND",
        "Nomor siswa cocok dengan lebih dari satu identitas. Hubungi admin.",
      );
    if (data?.length === 1) return data[0]!;
  }
  const { data, error } = await req.auth!.client.rpc("resolve_student_card", {
    p_school: school,
    p_qr: identity,
  });
  if (error) throw fromDatabaseError(error);
  if (!data?.id)
    throw new ApiError(
      404,
      "STUDENT_NOT_FOUND",
      "Kartu siswa tidak ditemukan.",
    );
  return data;
}
