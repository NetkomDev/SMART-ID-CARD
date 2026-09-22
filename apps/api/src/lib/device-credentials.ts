import type { Request } from "express";
import { z } from "zod";
import { ApiError } from "./errors.js";

export type DeviceCredentials = { deviceId: string; secret: string };

/** Parses transport credentials only; database RPCs perform authoritative authentication. */
export function readDeviceCredentials(req: Request): DeviceCredentials {
  const parsedId = z.uuid().safeParse(req.header("x-device-id"));
  const match = req.header("authorization")?.match(/^Device\s+([^\s]+)$/i);
  if (!parsedId.success || !match?.[1]) {
    throw new ApiError(401, "DEVICE_AUTH_INVALID", "X-Device-Id and Device authorization token are required");
  }
  return { deviceId: parsedId.data, secret: match[1] };
}
