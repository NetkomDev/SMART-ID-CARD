import type { Response } from "express";

export function sendData<T>(res: Response, data: T, status = 200, meta?: unknown): void {
  res.status(status).json({ success: true, data, ...(meta === undefined ? {} : { meta }) });
}
