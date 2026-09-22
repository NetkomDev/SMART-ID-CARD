import { z } from "zod";

const academicYearFields = {
  name: z.string().trim().min(1).max(32),
  start_date: z.iso.date(),
  end_date: z.iso.date()
};

const validDateRange = (value: { start_date?: string; end_date?: string }) =>
  !value.start_date || !value.end_date || value.end_date >= value.start_date;

export const createAcademicYearSchema = z.object(academicYearFields).strict()
  .refine(validDateRange, { message: "end_date must be on or after start_date", path: ["end_date"] });

export const updateAcademicYearSchema = z.object(academicYearFields).partial().strict()
  .refine((body) => Object.keys(body).length > 0, "At least one field must be supplied")
  .refine(validDateRange, { message: "end_date must be on or after start_date", path: ["end_date"] });

export const switchAcademicYearSchema = z.object({ academic_year_id: z.uuid() }).strict();
