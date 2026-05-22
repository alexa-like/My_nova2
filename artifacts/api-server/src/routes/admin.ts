import { Router } from "express";
import { User } from "../bot/models/User.js";
import { RedeemCode } from "../bot/models/RedeemCode.js";
import { Memory } from "../bot/models/Memory.js";
import { GroupSettings } from "../bot/models/GroupSettings.js";
import { Analytics } from "../bot/models/Analytics.js";
import { getOrCreateBotConfig } from "../bot/models/BotConfig.js";
import { getDailySummary, getTopCommands, getActiveUsers } from "../bot/services/analytics.js";
import { getBot } from "../bot/index.js";
import { setMaintenance } from "../bot/utils/maintenanceState.js";
import { setPremiumEmojiEnabled } from "../bot/utils/premiumEmoji.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── IP-based brute-force protection ──────────────────────────────────────────
// Tracks failed auth attempts per IP. After MAX_FAILURES within WINDOW_MS,
// the IP is locked out for LOCKOUT_MS regardless of the key provided.
const MAX_FAILURES  = 10;
const WINDOW_MS     = 60_000;      // 1 minute rolling window
const LOCKOUT_MS    = 15 * 60_000; // 15 minute lockout after too many failures

interface FailRecord { count: number; windowStart: number; lockedUntil: number }
const failMap = new Map<string, FailRecord>();

function getIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function recordFailure(ip: string): FailRecord {
  const now = Date.now();
  const rec = failMap.get(ip) ?? { count: 0, windowStart: now, lockedUntil: 0 };
  // Reset window if it has expired (and not currently locked)
  if (now - rec.windowStart >= WINDOW_MS && rec.lockedUntil <= now) {
    rec.count = 0;
    rec.windowStart = now;
  }
  rec.count++;
  if (rec.count >= MAX_FAILURES) rec.lockedUntil = now + LOCKOUT_MS;
  failMap.set(ip, rec);
  return rec;
}

// Clean stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of failMap.entries()) {
    if (rec.lockedUntil <= now && now - rec.windowStart >= WINDOW_MS) {
      failMap.delete(ip);
    }
  }
}, 30 * 60_000);

// ── Constant-time string comparison (prevents timing attacks) ─────────────────
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run the loop to avoid timing differences
    let dummy = 0;
    for (let i = 0; i < a.length; i++) dummy |= a.charCodeAt(i) ^ 0;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminAuth(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const ip = getIp(req);
  const now = Date.now();

  // Check lockout first
  const rec = failMap.get(ip);
  if (rec && rec.lockedUntil > now) {
    const retryAfterSec = Math.ceil((rec.lockedUntil - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many failed attempts. Try again later.",
      retryAfter: retryAfterSec,
    });
    return;
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: "Admin dashboard not configured (ADMIN_API_KEY not set)" });
    return;
  }

  const provided = String(
    req.headers["x-admin-key"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    ""
  );

  if (!safeEqual(provided, adminKey)) {
    const updated = recordFailure(ip);
    const remaining = MAX_FAILURES - updated.count;
    if (updated.lockedUntil > now) {
      res.setHeader("Retry-After", String(Math.ceil(LOCKOUT_MS / 1000)));
      res.status(429).json({
        error: "Too many failed attempts. Locked out for 15 minutes.",
        retryAfter: Math.ceil(LOCKOUT_MS / 1000),
      });
    } else {
      res.status(401).json({
        error: "Unauthorized",
        attemptsRemaining: Math.max(0, remaining),
      });
    }
    return;
  }

  // Successful auth — clear any failure record for this IP
  failMap.delete(ip);
  next();
}

router.use(adminAuth);

// ── GET /api/admin/stats ────────────────────────────────────────────────────
router.get("/admin/stats", async (_req, res) => {
  try {
    const bot = getBot();
    const [
      totalUsers, premiumUsers, bannedUsers, activeToday, totalGroups, totalMemories,
      totalCodes, usedCodes, imageGens, messagesTotal, errorsTotal, activeUsersHour,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ "premium.active": true }),
      User.countDocuments({ banned: true }),
      User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } }),
      GroupSettings.countDocuments(),
      Memory.countDocuments(),
      RedeemCode.countDocuments(),
      RedeemCode.countDocuments({ used: true }),
      Analytics.countDocuments({ event: "image_gen" }),
      Analytics.countDocuments({ event: "message" }),
      Analytics.countDocuments({ event: "error" }),
      getActiveUsers(3600000),
    ]);
    let botInfo = null;
    if (bot) { try { botInfo = await bot.getMe(); } catch {} }
    res.json({
      bot: bot ? { status: "online", ...botInfo } : { status: "offline" },
      users: { total: totalUsers, premium: premiumUsers, banned: bannedUsers, activeToday },
      groups: totalGroups,
      memory: totalMemories,
      codes: { total: totalCodes, used: usedCodes },
      analytics: { imageGens, messagesTotal, errorsTotal, activeUsersHour },
    });
  } catch (err) {
    logger.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── GET /api/admin/analytics ────────────────────────────────────────────────
router.get("/admin/analytics", async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const [summary, topCommands] = await Promise.all([getDailySummary(days), getTopCommands(10)]);
    res.json({ summary, topCommands });
  } catch (err) {
    logger.error({ err }, "Admin analytics error");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ── GET /api/admin/users ────────────────────────────────────────────────────
router.get("/admin/users", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const search = req.query.search as string | undefined;
    const filter: Record<string, unknown> = {};
    if (req.query.premium === "true") filter["premium.active"] = true;
    if (req.query.banned === "true") filter.banned = true;
    if (search) {
      const n = Number(search);
      filter.$or = Number.isInteger(n) && n > 0
        ? [{ userId: n }, { username: new RegExp(search, "i") }]
        : [{ username: new RegExp(search, "i") }, { firstName: new RegExp(search, "i") }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).sort({ lastSeen: -1 }).skip((page - 1) * limit).limit(limit).select("-__v"),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error({ err }, "Admin users error");
    res.status(500).json({ error: "Failed to load users" });
  }
});

// ── GET /api/admin/users/:userId ────────────────────────────────────────────
router.get("/admin/users/:userId", async (req, res) => {
  try {
    const user = await User.findOne({ userId: Number(req.params.userId) }).select("-__v");
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const memory = await Memory.findOne({ userId: user.userId });
    res.json({ user, memoryCount: memory?.messages?.length ?? 0 });
  } catch (err) {
    logger.error({ err }, "Admin user lookup error");
    res.status(500).json({ error: "Failed to load user" });
  }
});

// ── POST /api/admin/users/:userId/ban ───────────────────────────────────────
router.post("/admin/users/:userId/ban", async (req, res) => {
  try {
    const user = await User.findOneAndUpdate({ userId: Number(req.params.userId) }, { banned: true }, { new: true });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, userId: user.userId, banned: true });
  } catch (err) { res.status(500).json({ error: "Failed to ban user" }); }
});

// ── POST /api/admin/users/:userId/unban ─────────────────────────────────────
router.post("/admin/users/:userId/unban", async (req, res) => {
  try {
    const user = await User.findOneAndUpdate({ userId: Number(req.params.userId) }, { banned: false }, { new: true });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, userId: user.userId, banned: false });
  } catch (err) { res.status(500).json({ error: "Failed to unban user" }); }
});

// ── POST /api/admin/users/:userId/premium ───────────────────────────────────
router.post("/admin/users/:userId/premium", async (req, res) => {
  try {
    const { active, days } = req.body as { active: boolean; days?: number };
    const update: Record<string, unknown> = { "premium.active": active };
    if (active && days && days > 0) {
      update["premium.expiresAt"] = new Date(Date.now() + days * 86400000);
      update["premium.plan"] = `${days}d`;
    } else if (!active) {
      update["premium.expiresAt"] = null;
      update["premium.plan"] = null;
    }
    const user = await User.findOneAndUpdate({ userId: Number(req.params.userId) }, { $set: update }, { new: true });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const bot = getBot();
    if (bot) {
      try { await bot.sendMessage(user.userId, `✨ Your premium access has been ${active ? "granted" : "revoked"} by the admin.`); } catch {}
    }
    res.json({ success: true, userId: user.userId, premium: user.premium });
  } catch (err) { res.status(500).json({ error: "Failed to update premium" }); }
});

// ── DELETE /api/admin/users/:userId/memory ──────────────────────────────────
router.delete("/admin/users/:userId/memory", async (req, res) => {
  try {
    await Memory.deleteMany({ userId: Number(req.params.userId) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to clear memory" }); }
});

// ── DELETE /api/admin/users/:userId ─────────────────────────────────────────
router.delete("/admin/users/:userId", async (req, res) => {
  try {
    const uid = Number(req.params.userId);
    await User.deleteOne({ userId: uid });
    await Memory.deleteMany({ userId: uid });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete user" }); }
});

// ── POST /api/admin/users/:userId/message ───────────────────────────────────
router.post("/admin/users/:userId/message", async (req, res) => {
  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }
  const bot = getBot();
  if (!bot) { res.status(503).json({ error: "Bot is offline" }); return; }
  try {
    await bot.sendMessage(Number(req.params.userId), `📨 Message from Admin:\n\n${message}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send message" });
  }
});

// ── POST /api/admin/broadcast ───────────────────────────────────────────────
router.post("/admin/broadcast", async (req, res) => {
  const { message, premiumOnly } = req.body as { message: string; premiumOnly?: boolean };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }
  const bot = getBot();
  if (!bot) { res.status(503).json({ error: "Bot is offline" }); return; }
  try {
    const filter = premiumOnly ? { banned: false, "premium.active": true } : { banned: false };
    const users = await User.find(filter).select("userId");
    const total = users.length;
    // Fire-and-forget — respond immediately so the HTTP request does not time out
    res.json({ success: true, queued: true, total });
    // Background broadcast with Telegram-safe 40 ms spacing (~25 msgs/sec)
    ;(async () => {
      let sent = 0, failed = 0;
      for (const u of users) {
        try { await bot.sendMessage(u.userId, message); sent++; } catch { failed++; }
        await new Promise((r) => setTimeout(r, 40));
      }
      logger.info({ sent, failed, total }, "Broadcast complete");
    })().catch((err) => logger.error({ err }, "Broadcast background error"));
  } catch (err) {
    logger.error({ err }, "Broadcast error");
    res.status(500).json({ error: "Broadcast failed" });
  }
});

// ── GET /api/admin/codes ────────────────────────────────────────────────────
router.get("/admin/codes", async (_req, res) => {
  try {
    const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(200).select("-__v");
    res.json({ codes });
  } catch (err) { res.status(500).json({ error: "Failed to load codes" }); }
});

// ── POST /api/admin/codes ───────────────────────────────────────────────────
const VALID_DURATION = /^(\d+[dwmy]|lifetime)$/i;
router.post("/admin/codes", async (req, res) => {
  const { code, duration } = req.body as { code: string; duration: string };
  if (!code?.trim() || !duration?.trim()) { res.status(400).json({ error: "code and duration are required" }); return; }
  if (!VALID_DURATION.test(duration.trim())) { res.status(400).json({ error: "Invalid duration. Use format: 30d, 7d, 1m, 1y, or lifetime" }); return; }
  try {
    const existing = await RedeemCode.findOne({ code: code.toUpperCase() });
    if (existing) { res.status(409).json({ error: "Code already exists" }); return; }
    const newCode = new RedeemCode({ code: code.toUpperCase(), duration, used: false });
    await newCode.save();
    res.json({ success: true, code: newCode });
  } catch (err) { res.status(500).json({ error: "Failed to create code" }); }
});

// ── POST /api/admin/codes/generate ──────────────────────────────────────────
router.post("/admin/codes/generate", async (req, res) => {
  const { count, duration } = req.body as { count: number; duration: string };
  const n = Math.min(100, Math.max(1, Number(count) || 1));
  if (!duration?.trim()) { res.status(400).json({ error: "duration is required" }); return; }
  if (!VALID_DURATION.test(duration.trim())) { res.status(400).json({ error: "Invalid duration. Use format: 30d, 7d, 1m, 1y, or lifetime" }); return; }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const created = [];
  for (let i = 0; i < n; i++) {
    const code = `NOVA-${rand(4)}-${rand(4)}`;
    const doc = new RedeemCode({ code, duration, used: false });
    await doc.save();
    created.push(doc);
  }
  res.json({ success: true, codes: created });
});

// ── DELETE /api/admin/codes/:id ─────────────────────────────────────────────
router.delete("/admin/codes/:id", async (req, res) => {
  try {
    await RedeemCode.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete code" }); }
});

// ── GET /api/admin/logs ─────────────────────────────────────────────────────
router.get("/admin/logs", async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const event = req.query.event as string | undefined;
    const filter: Record<string, unknown> = {};
    if (event) filter.event = event;
    const logs = await Analytics.find(filter).sort({ ts: -1 }).limit(limit).select("-__v");
    res.json({ logs });
  } catch (err) { res.status(500).json({ error: "Failed to load logs" }); }
});

// ── GET /api/admin/groups ────────────────────────────────────────────────────
router.get("/admin/groups", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const [groups, total] = await Promise.all([
      GroupSettings.find().sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).select("-__v"),
      GroupSettings.countDocuments(),
    ]);
    res.json({ groups, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: "Failed to load groups" }); }
});

// ── DELETE /api/admin/groups/:chatId ─────────────────────────────────────────
router.delete("/admin/groups/:chatId", async (req, res) => {
  try {
    await GroupSettings.deleteOne({ chatId: Number(req.params.chatId) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete group" }); }
});

// ── GET /api/admin/config ────────────────────────────────────────────────────
router.get("/admin/config", async (_req, res) => {
  try {
    const config = await getOrCreateBotConfig();
    res.json(config.toObject ? config.toObject() : config);
  } catch (err) { res.status(500).json({ error: "Failed to load config" }); }
});

// ── PATCH /api/admin/config ──────────────────────────────────────────────────
router.patch("/admin/config", async (req, res) => {
  try {
    const config = await getOrCreateBotConfig();
    const allowed = [
      "activeChatModel", "activeImageModel", "activeVideoModel", "activeVoiceModel",
      "activeAsrModel", "premiumEmojiEnabled", "maintenanceMode", "welcomeMessage", "botPersonality",
    ];
    for (const key of allowed) {
      if (key in req.body) (config as any)[key] = req.body[key];
    }
    await config.save();
    if ("maintenanceMode" in req.body) setMaintenance(req.body.maintenanceMode);
    if ("premiumEmojiEnabled" in req.body) setPremiumEmojiEnabled(req.body.premiumEmojiEnabled);
    res.json({ success: true, config: config.toObject ? config.toObject() : config });
  } catch (err) { res.status(500).json({ error: "Failed to update config" }); }
});

// ── PUT /api/admin/config/limits ─────────────────────────────────────────────
router.put("/admin/config/limits", async (req, res) => {
  try {
    const config = await getOrCreateBotConfig();
    const limits = req.body as Record<string, number>;
    const limitKeys = [
      "freeMessages", "freeImages", "freeBuilds", "freeVideos", "freeMusic",
      "premiumMessages", "premiumImages", "premiumBuilds", "premiumVideos", "premiumMusic",
      "resetIntervalHours",
    ];
    for (const key of limitKeys) {
      if (key in limits && typeof limits[key] === "number") {
        (config.usageLimits as any)[key] = limits[key];
      }
    }
    config.markModified("usageLimits");
    await config.save();
    res.json({ success: true, usageLimits: config.usageLimits });
  } catch (err) { res.status(500).json({ error: "Failed to update limits" }); }
});

// ── POST /api/admin/maintenance ──────────────────────────────────────────────
router.post("/admin/maintenance", async (req, res) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    setMaintenance(enabled);
    const config = await getOrCreateBotConfig();
    config.maintenanceMode = enabled;
    await config.save();
    res.json({ success: true, maintenanceMode: enabled });
  } catch (err) { res.status(500).json({ error: "Failed to toggle maintenance" }); }
});

// ── POST /api/admin/premium-emoji ────────────────────────────────────────────
router.post("/admin/premium-emoji", async (req, res) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    setPremiumEmojiEnabled(enabled);
    const config = await getOrCreateBotConfig();
    config.premiumEmojiEnabled = enabled;
    await config.save();
    res.json({ success: true, premiumEmojiEnabled: enabled });
  } catch (err) { res.status(500).json({ error: "Failed to toggle premium emoji" }); }
});

// ── GET /api/admin/feedback ───────────────────────────────────────────────────
router.get("/admin/feedback", async (req, res) => {
  try {
    const { Feedback } = await import("../bot/models/Feedback.js");
    const type = req.query.type as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter: Record<string, unknown> = type ? { type } : {};
    const [items, unread] = await Promise.all([
      Feedback.find(filter).sort({ createdAt: -1 }).limit(limit),
      Feedback.countDocuments({ read: false }),
    ]);
    res.json({ items, unread });
  } catch (err) {
    logger.error({ err }, "Admin feedback error");
    res.status(500).json({ error: "Failed to load feedback" });
  }
});

// ── PATCH /api/admin/feedback/:id/read ───────────────────────────────────────
router.patch("/admin/feedback/:id/read", async (req, res) => {
  try {
    const { Feedback } = await import("../bot/models/Feedback.js");
    await Feedback.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

export default router;
