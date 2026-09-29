import { z } from "zod";
const kilograms = z.number().nonnegative().max(1000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7, "Gunakan maksimal tiga angka desimal untuk berat");
export const createWasteSchema=z.object({event_id:z.uuid(),class_id:z.uuid(),student_id:z.uuid(),organic_kg:kilograms,inorganic_kg:kilograms,source:z.enum(["MANUAL","SCALE"])}).strict().refine(v=>v.organic_kg+v.inorganic_kg>0,"Total weight must be greater than zero");
