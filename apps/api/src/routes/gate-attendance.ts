import { Router } from "express";
import { readDeviceCredentials } from "../lib/device-credentials.js";
import { fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { createPublicClient } from "../lib/supabase.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { validate } from "../middleware/validate.js";
import { gateAttendanceBatchSchema, gateAttendanceEventSchema } from "../schemas/gate-attendance.js";

const router = Router();

router.post("/attendance", validate({ body: gateAttendanceEventSchema }), asyncHandler(async (req, res) => {
  const credentials = readDeviceCredentials(req);
  const { data, error } = await createPublicClient().rpc("ingest_gate_attendance", {
    target_device_id: credentials.deviceId,
    device_secret: credentials.secret,
    attendance_event_id: req.body.event_id,
    attendance_card_uid: req.body.card_uid,
    attendance_occurred_at: req.body.occurred_at,
    attendance_local_sequence: req.body.local_sequence,
    attendance_source: "REALTIME",
    attendance_metadata: req.body.metadata
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data, data?.duplicate === true ? 200 : 201);
}));

router.post("/attendance/sync", validate({ body: gateAttendanceBatchSchema }), asyncHandler(async (req, res) => {
  const credentials = readDeviceCredentials(req);
  const events = [...req.body.events].sort((left, right) => left.local_sequence - right.local_sequence);
  const { data, error } = await createPublicClient().rpc("sync_gate_attendance_batch", {
    target_device_id: credentials.deviceId,
    device_secret: credentials.secret,
    attendance_events: events
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

export { router as gateAttendanceRouter };
