import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./bot/index.js";
import { startKeepAlive } from "./bot/services/keepAlive.js";

// ── Global safety net — log unhandled errors instead of crashing silently ────
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  startKeepAlive();
});

startBot().catch((err) => {
  logger.error({ err }, "Failed to start Telegram bot");
});
