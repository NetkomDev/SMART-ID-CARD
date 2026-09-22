import { z } from "zod";

export const claimParentLinkSchema = z.object({
  token: z.string().min(32).max(256),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(32).nullable().optional()
}).strict();

export const createParentTokenSchema = z.object({
  student_id: z.uuid(),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
  expires_in_hours: z.number().int().min(1).max(168).default(24)
}).strict();
