import pino from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "password", "refresh_token", "access_token", "refreshToken", "token", "photo_url", "photo_data", "*.password", "*.refresh_token", "*.access_token"],
    censor: "[REDACTED]"
  }
});
