import { z } from "zod";

export const createStudentHistorySchema = z.object({
  class_id: z.uuid(),
  academic_year_id: z.uuid(),
  start_date: z.iso.date()
}).strict();
