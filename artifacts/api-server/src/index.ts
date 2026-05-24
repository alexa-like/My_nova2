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

// ── Required environment variable validation ──────────────────────────────────
const REQUIRED_ENV: Record<string, string> = {
  PORT:               "Server port number",
  TELEGRAM_BOT_TOKEN: "Telegram bot token from @BotFather",
  MONGODB_URI:        "MongoDB connection string",
};

const OPTIONAL_WARN_ENV: Record<string, string> = {
  OPENROUTER_API_KEY: "OpenRouter API key (AI chat will use fallback without it)",
  OWNER_ID:           "Telegram user ID of the bot owner (owner dashboard disabled without it)",
  ADMIN_API_KEY:      "Admin dashboard API key (dashboard auth disabled without it)",
};

const isProd = process.env["NODE_ENV"] === "production";
let envValid = true;
for (const [key, desc] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[key]) {
    if (isProd) {
      logger.error(`Missing required env var: ${key} — ${desc}`);
      envValid = false;
    } else {
      logger.warn(`Required env var not set: ${key} — ${desc} (bot features will be disabled)`);
    }
  }
}
if (!envValid) {
  logger.error("Aborting startup: required environment variables are missing. Set them in your Render dashboard.");
  process.exit(1);
}

for (const [key, desc] of Object.entries(OPTIONAL_WARN_ENV)) {
  if (!process.env[key]) {
    logger.warn(`Optional env var not set: ${key} — ${desc}`);
  }
}

const rawPort = process.env["PORT"];
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
