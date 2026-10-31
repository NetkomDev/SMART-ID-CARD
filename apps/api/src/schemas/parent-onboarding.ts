import { z } from "zod";

export function normalizeWhatsApp(value: string): string {
  const cleaned = value.trim().replace(/[\s()-]/g, "");
  const local = cleaned.startsWith("+62") ? cleaned.slice(3) : cleaned.startsWith("62") ? cleaned.slice(2) : cleaned.startsWith("0") ? cleaned.slice(1) : "";
  if (!/^8\d{8,11}$/.test(local)) throw new Error("Gunakan nomor WhatsApp Indonesia yang valid, misalnya 081234567890.");
  return `+62${local}`;
}
const phone = z.string().max(40).transform((value, ctx) => {
  try { return normalizeWhatsApp(value); } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); return z.NEVER; }
});
export const parentEnrollmentSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  nisn: z.string().trim().regex(/^\d{4,20}$/),
  date_of_birth: z.iso.date(),
  full_name: z.string().trim().min(3).max(200),
  phone,
}).strict();
export const parentRecoverySchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
