import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { ApiError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { requireAuth } from "./middleware/auth.js";
import { requireTenant } from "./middleware/tenant.js";
import { authRouter } from "./routes/auth.js";
import { classesRouter } from "./routes/classes.js";
import { schoolsRouter } from "./routes/schools.js";
import { studentsRouter } from "./routes/students.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    req.requestId = req.header("x-request-id") || randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use(pinoHttp({ logger, genReqId: (req) => req.headers["x-request-id"] as string }));
  app.use(rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, "RATE_LIMITED", "Too many requests"))
  }));

  const health = (_req: express.Request, res: express.Response) =>
    res.json({ success: true, data: { status: "ok" } });
  app.get("/health", health);
  app.get("/api/v1/health", health);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", requireAuth, requireTenant);
  app.use("/api/v1/schools", schoolsRouter);
  app.use("/api/v1/classes", classesRouter);
  app.use("/api/v1/students", studentsRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
