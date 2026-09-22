import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { readDeviceCredentials } from "../lib/device-credentials.js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { createPublicClient } from "../lib/supabase.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, requireTenant } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { heartbeatSchema, registerDeviceSchema } from "../schemas/device.js";
import { paginationSchema } from "../schemas/common.js";

const router = Router();

router.get("/", requireAuth, requireTenant, requirePermission("device.read"),
  validate({ query: paginationSchema }), asyncHandler(async (req, res) => {
    const { page, page_size: pageSize, search } = req.query as unknown as {
      page: number; page_size: number; search?: string;
    };
    let query = req.auth!.client.from("devices")
      .select("id, school_id, device_code, device_type, name, location, firmware_version, hardware_version, update_channel, status, last_seen_at, created_at, updated_at", { count: "exact" })
      .eq("school_id", req.tenant!.schoolId).is("deleted_at", null)
      .range((page - 1) * pageSize, page * pageSize - 1).order("name");
    if (search) query = query.or(`name.ilike.%${search}%,device_code.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) throw fromDatabaseError(error);
    sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
  }));

router.post("/register", requireAuth, requireTenant, requirePermission("device.manage"),
  validate({ body: registerDeviceSchema }), asyncHandler(async (req, res) => {
    const secret = randomBytes(32).toString("base64url");
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const { data, error } = await req.auth!.client.rpc("register_device", {
      target_school_id: req.tenant!.schoolId,
      new_device_code: req.body.device_code,
      new_device_type: req.body.device_type,
      new_name: req.body.name,
      new_location: req.body.location ?? null,
      new_hardware_version: req.body.hardware_version ?? null,
      new_firmware_version: req.body.firmware_version ?? null,
      new_update_channel: req.body.update_channel,
      new_config: req.body.config,
      new_secret_hash: secretHash
    });
    if (error) throw fromDatabaseError(error);
    sendData(res, { device: data, credential: { token: secret, scheme: "Device" } }, 201);
  }));

router.post("/heartbeat", validate({ body: heartbeatSchema }), asyncHandler(async (req, res) => {
  const credentials = readDeviceCredentials(req);
  const { data, error } = await createPublicClient().rpc("record_device_heartbeat", {
    target_device_id: credentials.deviceId,
    device_secret: credentials.secret,
    heartbeat_uptime_seconds: req.body.uptime_seconds,
    heartbeat_signal_strength: req.body.signal_strength ?? null,
    heartbeat_firmware_version: req.body.firmware_version,
    heartbeat_storage_status: req.body.storage_status,
    heartbeat_last_error: req.body.last_error ?? null,
    heartbeat_reported_at: req.body.reported_at
  });
  if (error) throw fromDatabaseError(error);
  const heartbeat = Array.isArray(data) ? data[0] : data;
  sendData(res, { accepted: true, received_at: heartbeat?.received_at ?? new Date().toISOString() });
}));

router.get("/config", asyncHandler(async (req, res) => {
  const credentials = readDeviceCredentials(req);
  const { data, error } = await createPublicClient().rpc("get_device_config", {
    target_device_id: credentials.deviceId,
    device_secret: credentials.secret
  });
  if (error) throw fromDatabaseError(error);
  const config = Array.isArray(data) ? data[0] : data;
  if (!config) throw new ApiError(404, "DEVICE_NOT_REGISTERED", "Device was not found");
  sendData(res, config);
}));

export { router as devicesRouter };
