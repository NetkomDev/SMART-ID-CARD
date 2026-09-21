import { z } from "zod";

export const idParamsSchema = z.object({ id: z.uuid() }).strict();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  // PostgREST `.or()` uses a filter expression. Restrict input to literal search
  // characters so callers cannot inject additional operators/columns.
  search: z.string().trim().min(1).max(100)
    .regex(/^[\p{L}\p{N}\s.-]+$/u, "Search contains unsupported characters")
    .optional()
}).strict();
