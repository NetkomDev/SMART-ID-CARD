import { z } from "zod";
export const createWasteSchema=z.object({event_id:z.uuid(),class_id:z.uuid(),student_id:z.uuid(),organic_kg:z.number().nonnegative().max(1000),inorganic_kg:z.number().nonnegative().max(1000),source:z.enum(["MANUAL","SCALE"])}).strict().refine(v=>v.organic_kg+v.inorganic_kg>0,"Total weight must be greater than zero");
