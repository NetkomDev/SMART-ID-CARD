import { z } from "zod";

export const portalRoles = ["WASTE_STAFF", "LIBRARY_STAFF", "TEACHER", "PARENT"] as const;
export const qrGenerateSchema = z.object({
  school_id: z.uuid(),
  role_code: z.enum(portalRoles),
  metadata: z.object({ class_id: z.uuid().optional(), student_id: z.uuid().optional() }).strict().default({})
}).strict().superRefine((value, ctx) => {
  const required = value.role_code === "WASTE_STAFF" ? "class_id" : null;
  if (required && !value.metadata[required]) ctx.addIssue({ code: "custom", path: ["metadata", required], message: "Pilih kelas atau siswa untuk portal ini" });
  for (const key of Object.keys(value.metadata)) {
    if (key !== required) ctx.addIssue({ code: "custom", path: ["metadata", key], message: "Lingkup tidak sesuai portal" });
  }
});
export const qrLoginSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  role_code: z.enum(portalRoles)
}).strict();
