import { z } from "zod";

export const cardStatusSchema = z.enum(["ACTIVE", "LOST", "BLOCKED", "REPLACED", "EXPIRED"]);

const cardFields = {
  student_id: z.uuid(),
  card_uid: z.string().trim().min(1).max(64),
  card_serial: z.string().trim().min(1).max(100),
  qr_key: z.string().trim().min(16).max(128),
  status: cardStatusSchema.optional(),
  issued_at: z.iso.datetime({ offset: true }).nullable().optional(),
  expires_at: z.iso.datetime({ offset: true }).nullable().optional()
};

export const createCardSchema = z.object(cardFields).strict();
export const updateCardSchema = z.object({
  status: cardStatusSchema,
  expires_at: z.iso.datetime({ offset: true }).nullable().optional()
}).strict();

export const cardListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.uuid().optional(),
  status: cardStatusSchema.optional()
}).strict();
