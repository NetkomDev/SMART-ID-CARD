import { z } from "zod";

export const deviceTypeSchema = z.enum(["GATE", "LIBRARY", "LED", "CARD_STATION", "WASTE_SCALE", "OTHER"]);

export const registerDeviceSchema = z.object({
  device_code: z.string().trim().min(1).max(64),
  device_type: deviceTypeSchema,
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).nullable().optional(),
  hardware_version: z.string().trim().max(50).nullable().optional(),
  firmware_version: z.string().trim().max(50).nullable().optional(),
  update_channel: z.string().trim().min(1).max(32).default("stable"),
  config: z.record(z.string(), z.unknown()).default({})
}).strict();

export const heartbeatSchema = z.object({
  uptime_seconds: z.number().int().nonnegative(),
  signal_strength: z.number().int().min(-150).max(0).nullable().optional(),
  firmware_version: z.string().trim().min(1).max(50),
  storage_status: z.record(z.string(), z.unknown()).default({}),
  last_error: z.string().trim().max(1000).nullable().optional(),
  reported_at: z.iso.datetime({ offset: true })
}).strict();
