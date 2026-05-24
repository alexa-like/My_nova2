import { RateLimit } from "../models/RateLimit.js";

// ── Per-user global rate limiter (20 msgs / 60s, survives restarts) ───────────
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const PERSIST_THRESHOLD = 10; // start persisting to DB after this many hits

const userTimestamps = new Map<number, number[]>();

export function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const times = (userTimestamps.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);
  userTimestamps.set(userId, times);

  if (times.length > PERSIST_THRESHOLD) {
    persistRateLimit(userId, times).catch(() => {});
  }

  return times.length > MAX_REQUESTS;
}

async function persistRateLimit(userId: number, hits: number[]): Promise<void> {
  try {
    await RateLimit.findOneAndUpdate(
      { userId },
      { hits, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch { /* non-fatal */ }
}

export async function loadPersistedRateLimits(): Promise<void> {
  try {
    const now = Date.now();
    const recent = await RateLimit.find({ updatedAt: { $gte: new Date(now - WINDOW_MS) } });
    for (const entry of recent) {
      const validHits = entry.hits.filter((t) => now - t < WINDOW_MS);
      if (validHits.length > 0) {
        userTimestamps.set(entry.userId, validHits);
      }
    }
    if (recent.length > 0) {
      const { logger } = await import("../../lib/logger.js");
      logger.info({ count: recent.length }, "Loaded rate limit state from MongoDB");
    }
  } catch { /* non-fatal — in-memory only on failure */ }
}

// ── Per-user anti-flood tracker (N msgs / 10s per group) ─────────────────────
const floodMap = new Map<string, number[]>();
const FLOOD_WINDOW_MS = 10_000;

export function isFloodDetected(userId: number, chatId: number, limit: number): boolean {
  const key = `${userId}:${chatId}`;
  const now = Date.now();
  const times = (floodMap.get(key) ?? []).filter((t) => now - t < FLOOD_WINDOW_MS);
  times.push(now);
  floodMap.set(key, times);
  return times.length > limit;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of floodMap.entries()) {
    const recent = times.filter((t) => now - t < FLOOD_WINDOW_MS);
    if (recent.length === 0) floodMap.delete(key);
    else floodMap.set(key, recent);
  }
  for (const [key, times] of userTimestamps.entries()) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) userTimestamps.delete(key);
    else userTimestamps.set(key, recent);
  }
}, 5 * 60 * 1000);
