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
import { academicYearsRouter } from "./routes/academic-years.js";
import { cardsRouter } from "./routes/cards.js";
import { classesRouter } from "./routes/classes.js";
import { devicesRouter } from "./routes/devices.js";
import { schoolsRouter } from "./routes/schools.js";
import { studentHistoryRouter } from "./routes/student-history.js";
import { studentsRouter } from "./routes/students.js";

/**
 * Conflict-resolution invariant: all Phase 03-05 routers are composed here.
 * Device runtime routes must be mounted before the human tenant boundary.
 */
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

  // Phase 03 public/session endpoints.
  app.use("/api/v1/auth", authRouter);

  // Phase 05 uses two security boundaries in one router. Registration applies
  // human middleware locally; runtime calls authenticate with a device token.
  app.use("/api/v1/devices", devicesRouter);

  // Shared human authentication + tenant context for Phase 03-04 resources.
  app.use("/api/v1", requireAuth, requireTenant);

  // Phase 03 core tenant resources.
  app.use("/api/v1/schools", schoolsRouter);
  app.use("/api/v1/classes", classesRouter);

  // Phase 04 academic lifecycle resources. Mount nested history before the
  // student router so a future student catch-all cannot shadow it.
  app.use("/api/v1/academic-years", academicYearsRouter);
  app.use("/api/v1/students/:id/history", studentHistoryRouter);
  app.use("/api/v1/students", studentsRouter);
  app.use("/api/v1/cards", cardsRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
