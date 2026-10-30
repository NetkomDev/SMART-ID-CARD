import { createHmac } from "node:crypto";
import type { Store } from "express-rate-limit";
import { config } from "../config.js";
import { createServiceClient } from "./supabase.js";
import { ApiError } from "./errors.js";

export function databaseRateStore(): Store {
  return {
    localKeys: false,
    async increment(key) {
      const hash = createHmac("sha256", config.SUPABASE_SERVICE_ROLE_KEY).update(`rate:${key}`).digest("hex");
      const { data, error } = await createServiceClient().rpc("increment_api_rate", { p_key: hash, p_window_ms: config.RATE_LIMIT_WINDOW_MS });
      if (error || !data) throw new ApiError(503, "SERVER_UNAVAILABLE", "Pembatasan akses belum tersedia.");
      return { totalHits: Number(data.total_hits), resetTime: new Date(data.reset_at) };
    },
    // All attempts count; middleware never refunds or resets a bucket.
    decrement() {}, resetKey() {}
  };
}
