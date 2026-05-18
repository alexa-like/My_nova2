// ── Per-user global rate limiter (20 msgs / 60s) ─────────────────────────────
const userTimestamps = new Map<number, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const times = (userTimestamps.get(userId) || []).filter(
    (t) => now - t < WINDOW_MS
  );
  times.push(now);
  userTimestamps.set(userId, times);
  return times.length > MAX_REQUESTS;
}

// ── Per-user anti-flood tracker (N msgs / 10s per group) ─────────────────────
const floodMap = new Map<string, number[]>();
const FLOOD_WINDOW_MS = 10_000;

/**
 * Returns true if the user is flooding in this specific chat.
 * Flood = more than `limit` messages in the last 10 seconds.
 */
export function isFloodDetected(
  userId: number,
  chatId: number,
  limit: number
): boolean {
  const key = `${userId}:${chatId}`;
  const now = Date.now();
  const times = (floodMap.get(key) || []).filter(
    (t) => now - t < FLOOD_WINDOW_MS
  );
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
