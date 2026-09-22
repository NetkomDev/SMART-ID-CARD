import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "AKSIS Core API listening");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "graceful shutdown failed");
      process.exitCode = 1;
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
