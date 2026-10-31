import { z } from "zod";

export const linkChildByNisnDobSchema = z.object({
  nisn: z.string().trim().min(4, "NISN minimal 4 karakter").max(20, "NISN maksimal 20 karakter"),
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir harus YYYY-MM-DD")
}).strict();

export const claimParentPermitSchema = z.object({
  student_id: z.string().uuid(),
  permit_date: z.string().trim().min(1).max(20),
  reason: z.enum(["SAKIT", "IZIN", "ALASAN_LAIN"]),
  notes: z.string().trim().max(500).optional().default(""),
  attachment_url: z.string().optional().default("")
}).strict();
