import { Analytics, type AnalyticsEvent } from "../models/Analytics.js";
import { logger } from "../../lib/logger.js";

export async function track(
  event: AnalyticsEvent,
  userId?: number,
  chatId?: number,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await Analytics.create({ event, userId, chatId, meta, ts: new Date() });
  } catch (err) {
    logger.warn({ err }, "Failed to track analytics event (non-fatal)");
  }
}

export async function getDailySummary(days = 7): Promise<Record<string, unknown>> {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const results = await Analytics.aggregate([
      { $match: { ts: { $gte: since } } },
      {
        $group: {
          _id: {
            event: "$event",
            day: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);
    return { days, results };
  } catch (err) {
    logger.warn({ err }, "Failed to get analytics summary");
    return { days, results: [] };
  }
}

export async function getTopCommands(limit = 10): Promise<unknown[]> {
  try {
    return await Analytics.aggregate([
      { $match: { event: "command" } },
      { $group: { _id: "$meta.command", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
  } catch {
    return [];
  }
}

export async function getActiveUsers(windowMs = 86400000): Promise<number> {
  try {
    const since = new Date(Date.now() - windowMs);
    const result = await Analytics.aggregate([
      { $match: { ts: { $gte: since }, userId: { $exists: true } } },
      { $group: { _id: "$userId" } },
      { $count: "total" },
    ]);
    return result[0]?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function getFeatureStats(days = 7): Promise<Record<string, number>> {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const results = await Analytics.aggregate([
      { $match: { event: "feature", ts: { $gte: since } } },
      { $group: { _id: "$meta.feature", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const out: Record<string, number> = {};
    for (const r of results) if (r._id) out[r._id] = r.count;
    return out;
  } catch {
    return {};
  }
}

export async function getErrorRate(days = 1): Promise<number> {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const [total, errors] = await Promise.all([
      Analytics.countDocuments({ ts: { $gte: since } }),
      Analytics.countDocuments({ event: "error", ts: { $gte: since } }),
    ]);
    return total > 0 ? Math.round((errors / total) * 100) : 0;
  } catch {
    return 0;
  }
}

export async function trackFeature(userId: number, feature: string): Promise<void> {
  return track("feature", userId, undefined, { feature });
}

export async function trackError(userId: number | undefined, context: string, error: string): Promise<void> {
  return track("error", userId, undefined, { context, error: error.slice(0, 200) });
}
