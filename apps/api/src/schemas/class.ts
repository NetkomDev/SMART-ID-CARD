import { z } from "zod";

const classFields = {
  academic_year_id: z.uuid(),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(120),
  grade_level: z.number().int().min(1).max(12).nullable().optional(),
  homeroom_teacher_user_id: z.uuid().nullable().optional(),
  is_active: z.boolean().optional()
};

export const createClassSchema = z.object(classFields).strict();
export const updateClassSchema = z.object(classFields).partial().strict().refine(
  (body) => Object.keys(body).length > 0,
  "At least one field must be supplied"
);
