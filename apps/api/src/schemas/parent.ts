import { z } from "zod";

export const claimParentLinkSchema = z.object({
  nisn: z.string().trim().min(1).max(50),
  dob: z.string().trim().min(1).max(50),
  full_name: z.string().trim().max(200).optional().default("")
}).strict();

export const createParentTokenSchema = z.object({
  student_id: z.string().uuid(),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
  expires_in_hours: z.number().int().min(1).max(168).default(24)
}).strict();

export const claimParentPermitSchema = z.object({
  student_id: z.string().uuid(),
  permit_date: z.string().trim().min(1).max(20),
  reason: z.enum(["SAKIT", "IZIN", "ALASAN_LAIN"]),
  notes: z.string().trim().max(500).optional().default(""),
  attachment_url: z.string().optional().default("")
}).strict();
