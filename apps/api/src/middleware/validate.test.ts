import { expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { validate } from "./validate.js";
import { paginationSchema } from "../schemas/common.js";
it("preserves parsed defaults across the Express 5 query getter", () => {
  const req = Object.create({}, { query: { get: () => ({ search: "123" }), configurable: true } }) as Request;
  const next = vi.fn();
  validate({ query: paginationSchema })(req, {} as Response, next);
  expect(next).toHaveBeenCalledWith();
  expect(req.query).toEqual({ search: "123", page: 1, page_size: 20 });
});
