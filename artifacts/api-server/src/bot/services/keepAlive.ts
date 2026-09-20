import axios from "axios";
import { logger } from "../../lib/logger.js";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the self-ping loop. Call once after the server is listening.
 * Uses the SERVER_URL env var to ping /api/healthz when running outside Vercel.
 */
export function startKeepAlive(): void {
  const base =
    process.env.SERVER_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

  if (!base) {
    logger.warn(
      "SERVER_URL / RENDER_EXTERNAL_URL not set — self-ping keep-alive disabled"
    );
    return;
  }

  const url = `${base.replace(/\/$/, "")}/api/healthz`;
  logger.info({ url, intervalMs: PING_INTERVAL_MS }, "Self-ping keep-alive started");

  pingInterval = setInterval(async () => {
    try {
      const res = await axios.get(url, { timeout: 10_000 });
      logger.debug({ status: res.status }, "Self-ping OK");
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Self-ping failed (non-fatal)");
    }
  }, PING_INTERVAL_MS);

  pingInterval.unref?.();
}

export function stopKeepAlive(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}
