import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../lib/errors.js";

type RequestSchemas = Partial<Record<"body" | "params" | "query", ZodType>>;

export const validate = (schemas: RequestSchemas): RequestHandler => (req, _res, next) => {
  for (const [source, schema] of Object.entries(schemas) as Array<[keyof RequestSchemas, ZodType]>) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ApiError(422, "VALIDATION_ERROR", `Invalid request ${source}`, result.error.flatten()));
      return;
    }
    // Express 5 reparses its query getter; install the validated/coerced value once.
    if (source === "query") Object.defineProperty(req, "query", { value: result.data, configurable: true, writable: true });
    else req[source] = result.data;
  }
  next();
};
