import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default(""),
  SESSION_COOKIE_KEY: z.string().default(""),
  PUBLIC_APP_URL: z.url().default("http://localhost:4173"),
  CORS_ORIGINS: z.string().default("http://localhost:4173,http://localhost:4174,http://localhost:4175,http://localhost:4176,http://localhost:4177"),
  LOG_LEVEL: z.string().default("info"),
  TRUST_PROXY_CIDRS: z.string().default(""),
  RATE_LIMIT_BACKEND: z.enum(["memory", "database"]).default("memory"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120)
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim())
};
