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
  SUPABASE_URL: "Supabase project URL",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase server key",
};

const TELEGRAM_ENV: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: "Telegram bot token from @BotFather",
};

const OPTIONAL_WARN_ENV: Record<string, string> = {
  ...TELEGRAM_ENV,
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
  logger.error("Aborting startup: required environment variables are missing. Configure them in the Vercel project settings.");
  process.exit(1);
}

for (const [key, desc] of Object.entries(OPTIONAL_WARN_ENV)) {
  if (!process.env[key]) {
    logger.warn(`Optional env var not set: ${key} — ${desc}`);
  }
}

if (process.env["VERCEL"] !== "1") {
  const rawPort = process.env["PORT"] ?? "3000";
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

  if (process.env["DISABLE_BOT"] !== "true") {
    startBot().catch((err) => {
      logger.error({ err }, "Failed to start Telegram bot");
    });
  } else {
    logger.info("Bot startup skipped (DISABLE_BOT=true)");
  }
}
