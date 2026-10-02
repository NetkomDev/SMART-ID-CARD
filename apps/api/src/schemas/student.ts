import { z } from "zod";

const studentFields = {
  nisn: z.string().trim().nullable().optional(),
  student_number: z.string().trim().min(1).max(50),
  full_name: z.string().trim().min(1).max(200),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),
  date_of_birth: z.string().trim().nullable().optional(),
  pob: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  is_active: z.boolean().optional(),
  class_id: z.string().uuid().nullable().optional(),
  class_name: z.string().trim().min(1).max(100).nullable().optional()
};

export const createStudentSchema = z.object(studentFields).strict();
export const updateStudentSchema = z.object(studentFields).partial().strict().refine(
  (body) => Object.keys(body).length > 0,
  "At least one field must be supplied"
);
