import { z } from "zod";

export const claimParentLinkSchema = z.object({
  nisn: z.string().trim().min(1).max(50),
  dob: z.string().trim().min(1).max(50),
  full_name: z.string().trim().max(200).optional().default("")
}).strict();

export const createParentTokenSchema = z.object({
  student_id: z.uuid(),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
  expires_in_hours: z.number().int().min(1).max(168).default(24)
}).strict();
