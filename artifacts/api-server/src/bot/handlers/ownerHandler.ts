import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { getOrCreateBotConfig, invalidateBotConfigCache } from "../models/BotConfig.js";
import { addDays, formatDate } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { setPending } from "../utils/pendingActions.js";
import { logger } from "../../lib/logger.js";
import { ownerMainKeyboard, backToOwnerKeyboard, ownerReplyKeyboard } from "../utils/keyboards.js";
import { getDailySummary, getTopCommands, getActiveUsers } from "../services/analytics.js";
import { addCredits, setCredits, resetCredits } from "../services/credits.js";
import { addPromoGroup, broadcastNewPromo } from "../services/groupGate.js";

// In-memory scheduled broadcasts
const scheduledBroadcasts = new Map<string, NodeJS.Timeout>();

// ── Show the owner panel (used by both /owner command and callback) ─────────────

export async function sendOwnerPanel(
  bot: TelegramBot,
  chatId: number,
  getMaintenance: () => boolean,
  messageId?: number
): Promise<void> {
  const [totalUsers, premiumUsers, bannedUsers, totalCodes, usedCodes, totalGroups] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ "premium.active": true }),
      User.countDocuments({ banned: true }),
      RedeemCode.countDocuments(),
      RedeemCode.countDocuments({ used: true }),
      GroupSettings.countDocuments(),
    ]);

  const config = await getOrCreateBotConfig();
  const activeChat = config.chatModels.find((m) => m.id === config.activeChatModel)?.name || config.activeChatModel;
  const activeImg = config.imageModels.find((m) => m.id === config.activeImageModel)?.name || config.activeImageModel;

  const text =
    `🤖 Nova Owner Dashboard\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Users: ${totalUsers}  |  💎 Premium: ${premiumUsers}\n` +
    `🚫 Banned: ${bannedUsers}  |  🏘 Groups: ${totalGroups}\n` +
    `🎟 Codes: ${usedCodes}/${totalCodes} used\n` +
    `🔧 Maintenance: ${getMaintenance() ? "🔴 ON" : "🟢 OFF"}\n\n` +
    `🧠 Chat Model: ${activeChat}\n` +
    `🖼 Image Model: ${activeImg}`;

  const keyboard = ownerMainKeyboard(getMaintenance());

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
      });
    } catch {}
  } else {
    await bot.sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

// ── Main owner command handler ────────────────────────────────────────────────

export async function handleOwnerMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  setMaintenance: (val: boolean) => void,
  getMaintenance: () => boolean
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const args = text.trim().split(/\s+/).slice(1);
  const cmd = text.trim().split(/\s+/)[0].split("@")[0];

  if (cmd === "/owner" || cmd === "/dashboard") {
    await bot.sendMessage(chatId, "🎛 Owner keyboard active — all commands at your fingertips!", {
      reply_markup: ownerReplyKeyboard(),
    });
    await sendOwnerPanel(bot, chatId, getMaintenance);
    return;
  }

  // ── Promo group commands (legacy slash commands kept for power users) ─────────────────────────────────────────────────

  if (cmd === "/listpromos") {
    const { getPromoGroups } = await import("../services/groupGate.js");
    const promos = await getPromoGroups();
    if (promos.length === 0) {
      await bot.sendMessage(chatId, `💰 No promo groups yet.\n\nUse the dashboard → Promotions → Add Promo Group.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const lines = promos.map((p, i) =>
      `${i + 1}. ${p.active ? "🟢" : "⏸"} *${p.title}* — ${p.reward}🪙\n   Verified: ${p.verifiedUsers.length}\n   Link: ${p.link}`
    ).join("\n\n");
    await bot.sendMessage(chatId, `💰 Promo Groups (${promos.length})\n\n${lines}`, { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/stats") {
    const [totalUsers, premiumUsers, bannedUsers, activeToday, totalMemories, totalCodes, totalGroups] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ "premium.active": true }),
        User.countDocuments({ banned: true }),
        User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } }),
        Memory.countDocuments(),
        RedeemCode.countDocuments(),
        GroupSettings.countDocuments(),
      ]);
    await bot.sendMessage(
      chatId,
      `📊 Bot Statistics\n\n` +
        `Users: ${totalUsers}\n` +
        `Active today: ${activeToday}\n` +
        `Premium: ${premiumUsers}\n` +
        `Banned: ${bannedUsers}\n` +
        `Groups: ${totalGroups}\n` +
        `Memory entries: ${totalMemories}\n` +
        `Redeem codes: ${totalCodes}\n` +
        `Maintenance: ${getMaintenance() ? "ON" : "OFF"}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/getusage") {
    const result = await User.aggregate([
      { $group: { _id: null, totalMessages: { $sum: "$usage.messages" }, totalImages: { $sum: "$usage.images" } } },
    ]);
    const stats = result[0] || { totalMessages: 0, totalImages: 0 };
    await bot.sendMessage(
      chatId,
      `📈 Usage Statistics\n\nTotal messages sent: ${stats.totalMessages}\nTotal images generated: ${stats.totalImages}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/analytics") {
    const days = parseInt(args[0] || "7") || 7;
    const [summary, topCmds, activeDay, activeWeek] = await Promise.all([
      getDailySummary(days),
      getTopCommands(8),
      getActiveUsers(86400000),
      getActiveUsers(604800000),
    ]);

    const rows = (summary as any).results as Array<{ _id: { event: string; day: string }; count: number }>;

    const byEvent: Record<string, number> = {};
    for (const r of rows) {
      byEvent[r._id.event] = (byEvent[r._id.event] || 0) + r.count;
    }

    const eventLines = Object.entries(byEvent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ev, ct]) => `  ${ev}: ${ct}`)
      .join("\n");

    const cmdLines = (topCmds as Array<{ _id: string; count: number }>)
      .map((c, i) => `  ${i + 1}. ${c._id || "unknown"}: ${c.count}`)
      .join("\n");

    const msg =
      `📊 Analytics — last ${days} days\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Active users (24h): ${activeDay}\n` +
      `👥 Active users (7d): ${activeWeek}\n\n` +
      `📌 Events breakdown:\n${eventLines || "  No data"}\n\n` +
      `🔢 Top commands:\n${cmdLines || "  No data"}\n\n` +
      `Tip: /analytics 30 for 30-day view`;

    await bot.sendMessage(chatId, msg, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/maintenance") {
    const val = args[0]?.toLowerCase();
    if (val !== "on" && val !== "off") {
      await bot.sendMessage(chatId, `Maintenance is currently ${getMaintenance() ? "ON" : "OFF"}.\nUsage: /maintenance on|off`);
      return;
    }
    setMaintenance(val === "on");
    await bot.sendMessage(
      chatId,
      `Maintenance mode turned ${val.toUpperCase()}. ${val === "on" ? "All users will see a maintenance message." : "Bot is back online."}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/redeemcd") {
    if (args.length < 2) {
      await bot.sendMessage(chatId, "Usage: /redeemcd <CODE> <duration> [maxUses]\nExamples:\n/redeemcd NOVA-VIP-01 30d        ← single use\n/redeemcd NOVA-VIP-01 30d 50     ← up to 50 users");
      return;
    }
    const code = args[0].toUpperCase();
    const duration = args[1].toLowerCase();
    const maxUses = args[2] ? parseInt(args[2]) : undefined;
    if (!/^(\d+(d|m|y)|lifetime)$/.test(duration)) {
      await bot.sendMessage(chatId, "Invalid duration. Use: 1d, 7d, 30d, 90d, 1y, lifetime");
      return;
    }
    if (maxUses !== undefined && (isNaN(maxUses) || maxUses < 1)) {
      await bot.sendMessage(chatId, "Invalid maxUses. Must be a number >= 1.");
      return;
    }
    try {
      if (await RedeemCode.findOne({ code })) {
        await bot.sendMessage(chatId, `Code "${code}" already exists.`);
        return;
      }
      const durationDays = parseDuration(duration);
      const newCode = new RedeemCode({ code, duration, durationDays, createdBy: user.userId, maxUses, usedCount: 0, usedByList: [] });
      await newCode.save();
      const usageNote = maxUses ? `Up to ${maxUses} users can use it` : "Single use only";
      await bot.sendMessage(chatId, `✅ Code created!\n\nCode: \`${code}\`\nDuration: ${duration} (${durationDays} days)\nUsage: ${usageNote}\n\nUsers redeem with: /redeem ${code}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      logger.error({ err }, "Failed to create redeem code");
      await bot.sendMessage(chatId, `Failed to create code: ${err?.message || "Unknown error"}`);
    }
    return;
  }

  if (cmd === "/listcodes") {
    const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(20);
    if (!codes.length) { await bot.sendMessage(chatId, "No codes found."); return; }
    const lines = codes.map((c) => {
      const isMulti = c.maxUses != null;
      const usedCount = c.usedCount ?? (c.used ? 1 : 0);
      const status = isMulti
        ? `${usedCount}/${c.maxUses} used`
        : c.used ? `Used by ${c.usedBy}` : "Available";
      return `\`${c.code}\` | ${c.duration} | ${status}`;
    });
    await bot.sendMessage(chatId, `🎟 Redeem Codes (last 20):\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    return;
  }

  if (cmd === "/resetcode") {
    const code = args[0]?.toUpperCase();
    if (!code) { await bot.sendMessage(chatId, "Usage: /resetcode <CODE>"); return; }
    const rc = await RedeemCode.findOne({ code });
    if (!rc) { await bot.sendMessage(chatId, "Code not found."); return; }
    rc.used = false;
    rc.usedBy = undefined;
    rc.usedAt = undefined;
    await rc.save();
    await bot.sendMessage(chatId, `✅ Code ${code} reset and available again.`);
    return;
  }

  // ── Credit management commands ─────────────────────────────────────────────

  if (cmd === "/addcredits") {
    if (args.length < 2) { await bot.sendMessage(chatId, "Usage: /addcredits <userId> <amount>"); return; }
    const targetId = parseInt(args[0]);
    const amount = parseInt(args[1]);
    if (isNaN(targetId) || isNaN(amount) || amount <= 0) { await bot.sendMessage(chatId, "Invalid userId or amount."); return; }
    const target = await User.findOne({ userId: targetId });
    if (!target) { await bot.sendMessage(chatId, `User ${targetId} not found.`); return; }
    const newBal = await addCredits(targetId, amount);
    await bot.sendMessage(chatId, `✅ Added ${amount} credits to user ${targetId}.\nNew balance: ${newBal} credits.`, { reply_markup: backToOwnerKeyboard() });
    try { await bot.sendMessage(targetId, `🎁 An admin added ${amount} credits to your account!\n\nNew balance: ${newBal} credits. Use /menu to start.`); } catch {}
    return;
  }

  if (cmd === "/removecredits") {
    if (args.length < 2) { await bot.sendMessage(chatId, "Usage: /removecredits <userId> <amount>"); return; }
    const targetId = parseInt(args[0]);
    const amount = parseInt(args[1]);
    if (isNaN(targetId) || isNaN(amount) || amount <= 0) { await bot.sendMessage(chatId, "Invalid userId or amount."); return; }
    const target = await User.findOne({ userId: targetId });
    if (!target) { await bot.sendMessage(chatId, `User ${targetId} not found.`); return; }
    const current = (target as any).credits ?? 0;
    const newBal = Math.max(0, current - amount);
    await setCredits(targetId, newBal);
    await bot.sendMessage(chatId, `✅ Removed ${amount} credits from user ${targetId}.\nNew balance: ${newBal} credits.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/setcredits") {
    if (args.length < 2) { await bot.sendMessage(chatId, "Usage: /setcredits <userId> <amount>"); return; }
    const targetId = parseInt(args[0]);
    const amount = parseInt(args[1]);
    if (isNaN(targetId) || isNaN(amount) || amount < 0) { await bot.sendMessage(chatId, "Invalid userId or amount."); return; }
    const target = await User.findOne({ userId: targetId });
    if (!target) { await bot.sendMessage(chatId, `User ${targetId} not found.`); return; }
    await setCredits(targetId, amount);
    await bot.sendMessage(chatId, `✅ Set credits for user ${targetId} to ${amount}.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/resetcredits") {
    if (!args[0]) { await bot.sendMessage(chatId, "Usage: /resetcredits <userId>"); return; }
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid userId."); return; }
    await resetCredits(targetId);
    await bot.sendMessage(chatId, `✅ Credits reset to default for user ${targetId}.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/creditstats") {
    const result = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$credits" }, avg: { $avg: "$credits" }, min: { $min: "$credits" }, max: { $max: "$credits" } } },
    ]);
    const s = result[0] || { total: 0, avg: 0, min: 0, max: 0 };
    const broke = await User.countDocuments({ credits: { $lte: 0 } });
    await bot.sendMessage(chatId,
      `💰 Credit Stats\n\nTotal credits in system: ${s.total}\nAverage per user: ${Math.round(s.avg)}\nMin: ${s.min}  |  Max: ${s.max}\nUsers with 0 credits: ${broke}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/setflashoffer") {
    const raw = args.join(" ");
    const parts = raw.split("|").map(s => s.trim());
    if (parts.length < 3) {
      await bot.sendMessage(chatId, "Usage: /setflashoffer <title> | <description> | <credits>\nExample: /setflashoffer Flash Sale | Get 200 bonus credits today only! | 200");
      return;
    }
    const [title, description, credStr] = parts;
    const creditsAmount = parseInt(credStr);
    if (isNaN(creditsAmount) || creditsAmount <= 0) { await bot.sendMessage(chatId, "Invalid credits amount."); return; }
    const config = await getOrCreateBotConfig();
    (config as any).flashOffer = { active: true, title, description, creditsAmount };
    await config.save();
    invalidateBotConfigCache();
    await bot.sendMessage(chatId, `✅ Flash offer activated!\n\nTitle: ${title}\nDescription: ${description}\nCredits: ${creditsAmount}\n\nUsers will see it in their Credits menu.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/endflashoffer") {
    const config = await getOrCreateBotConfig();
    (config as any).flashOffer = { active: false, title: "", description: "", creditsAmount: 0 };
    await config.save();
    invalidateBotConfigCache();
    await bot.sendMessage(chatId, "✅ Flash offer deactivated.", { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/lookup") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /lookup <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    const userCredits = (u as any).credits ?? 0;
    const premLine = u.premium.active
      ? `Yes — ${u.premium.plan || "premium"}${u.premium.expiresAt ? ` (exp: ${formatDate(u.premium.expiresAt)})` : ""}`
      : "No";
    await bot.sendMessage(
      chatId,
      `👤 User Lookup\n\n` +
        `ID: ${u.userId}\nName: ${u.firstName || "N/A"}\nUsername: ${u.username ? "@" + u.username : "N/A"}\n` +
        `Premium: ${premLine}\nBanned: ${u.banned ? "Yes" : "No"}\n` +
        `💰 Credits: ${userCredits}\n` +
        `Messages: ${u.usage.messages}  |  Images: ${u.usage.images}\n` +
        `Referrals: ${u.referrals?.length ?? 0}  |  Code: ${(u as any).referralCode || "none"}\n` +
        `First seen: ${formatDate(u.firstSeen)}\nLast seen: ${formatDate(u.lastSeen)}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/userlist") {
    const page = Math.max(1, parseInt(args[0] || "1") || 1);
    const perPage = 10;
    const users = await User.find().sort({ lastSeen: -1 }).skip((page - 1) * perPage).limit(perPage);
    const total = await User.countDocuments();
    if (!users.length) { await bot.sendMessage(chatId, "No users found."); return; }
    const lines = users.map((u, i) => {
      const badge = u.premium.active ? "[P]" : u.banned ? "[B]" : "";
      return `${(page - 1) * perPage + i + 1}. ${u.firstName || "?"} ${u.username ? "@" + u.username : ""} ${badge} (${u.userId})`;
    });
    await bot.sendMessage(chatId, `👥 Users (page ${page}/${Math.ceil(total / perPage)}):\n\n${lines.join("\n")}`);
    return;
  }

  if (cmd === "/grouplist") {
    const groups = await GroupSettings.find().sort({ updatedAt: -1 }).limit(20);
    if (!groups.length) { await bot.sendMessage(chatId, "No groups found."); return; }
    const lines = groups.map((g, i) => `${i + 1}. ${g.title || "Unnamed"} (${g.chatId}) AI:${g.aiEnabled ? "on" : "off"}`);
    await bot.sendMessage(chatId, `🏘 Groups:\n\n${lines.join("\n")}`);
    return;
  }

  if (cmd === "/groupstats") {
    const gid = parseInt(args[0]);
    if (isNaN(gid)) { await bot.sendMessage(chatId, "Usage: /groupstats <chatId>"); return; }
    const g = await GroupSettings.findOne({ chatId: gid });
    if (!g) { await bot.sendMessage(chatId, "Group not found."); return; }
    await bot.sendMessage(
      chatId,
      `🏘 Group: ${g.title || "Unnamed"}\nChat ID: ${g.chatId}\nAI: ${g.aiEnabled ? "On" : "Off"}\n` +
        `Anti-link: ${g.antilink ? "On" : "Off"}\nAnti-flood: ${g.antiflood ? "On" : "Off"}\nWarn limit: ${g.warnLimit}`
    );
    return;
  }

  if (cmd === "/deletegroup") {
    const gid = parseInt(args[0]);
    if (isNaN(gid)) { await bot.sendMessage(chatId, "Usage: /deletegroup <chatId>"); return; }
    await GroupSettings.deleteOne({ chatId: gid });
    await bot.sendMessage(chatId, `✅ Group ${gid} removed from database.`);
    return;
  }

  if (cmd === "/deleteuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /deleteuser <user_id>"); return; }
    await User.deleteOne({ userId: targetId });
    await Memory.deleteMany({ userId: targetId });
    await bot.sendMessage(chatId, `✅ User ${targetId} and all their data deleted.`);
    return;
  }

  if (cmd === "/broadcast") {
    const broadcastMsg = args.join(" ");
    if (!broadcastMsg) { await bot.sendMessage(chatId, "Usage: /broadcast <message>"); return; }
    const allUsers = await User.find({ banned: false, isOwner: false });
    let sent = 0, failed = 0;
    await bot.sendMessage(chatId, `📤 Broadcasting to ${allUsers.length} users...`);
    for (const u of allUsers) {
      try { await bot.sendMessage(u.userId, broadcastMsg); sent++; } catch { failed++; }
      await new Promise((r) => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `✅ Broadcast done!\nSent: ${sent}  |  Failed: ${failed}`);
    return;
  }

  if (cmd === "/broadcastpremium") {
    const broadcastMsg = args.join(" ");
    if (!broadcastMsg) { await bot.sendMessage(chatId, "Usage: /broadcastpremium <message>"); return; }
    const premUsers = await User.find({ banned: false, isOwner: false, "premium.active": true });
    let sent = 0, failed = 0;
    await bot.sendMessage(chatId, `💎 Broadcasting to ${premUsers.length} premium users...`);
    for (const u of premUsers) {
      try { await bot.sendMessage(u.userId, broadcastMsg); sent++; } catch { failed++; }
      await new Promise((r) => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `✅ Premium broadcast done!\nSent: ${sent}  |  Failed: ${failed}`);
    return;
  }

  if (cmd === "/announcement") {
    const announcementMsg = args.join(" ");
    if (!announcementMsg) { await bot.sendMessage(chatId, "Usage: /announcement <message>"); return; }
    const allUsers = await User.find({ banned: false, isOwner: false });
    let sent = 0, failed = 0;
    for (const u of allUsers) {
      try { await bot.sendMessage(u.userId, `📢 NOVA ANNOUNCEMENT\n\n${announcementMsg}`); sent++; } catch { failed++; }
      await new Promise((r) => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `✅ Announcement sent!\nSent: ${sent}  |  Failed: ${failed}`);
    return;
  }

  if (cmd === "/schedule") {
    const mins = parseInt(args[0]);
    const schedMsg = args.slice(1).join(" ");
    if (isNaN(mins) || mins < 1 || !schedMsg) {
      await bot.sendMessage(chatId, "Usage: /schedule <minutes> <message>");
      return;
    }
    const schedId = Date.now().toString();
    const timer = setTimeout(async () => {
      scheduledBroadcasts.delete(schedId);
      const allUsers = await User.find({ banned: false, isOwner: false });
      let sent = 0, failed = 0;
      for (const u of allUsers) {
        try { await bot.sendMessage(u.userId, `📅 Scheduled message:\n\n${schedMsg}`); sent++; } catch { failed++; }
        await new Promise((r) => setTimeout(r, 35));
      }
      await bot.sendMessage(chatId, `✅ Scheduled broadcast sent!\nSent: ${sent}  |  Failed: ${failed}`);
    }, mins * 60 * 1000);
    scheduledBroadcasts.set(schedId, timer);
    await bot.sendMessage(chatId, `⏰ Broadcast scheduled in ${mins} minute(s).\nMessage: "${schedMsg.slice(0, 100)}"`);
    return;
  }

  if (cmd === "/grantpremium") {
    const targetId = parseInt(args[0]);
    const duration = args[1]?.toLowerCase();
    if (isNaN(targetId) || !duration) { await bot.sendMessage(chatId, "Usage: /grantpremium <user_id> <duration>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    const days = parseDuration(duration);
    const expiresAt = days >= 99999 ? undefined : addDays(new Date(), days);
    u.premium.active = true;
    u.premium.expiresAt = expiresAt;
    u.premium.plan = duration;
    await u.save();
    try { await bot.sendMessage(targetId, `✨ You've been granted Premium by the owner!\nDuration: ${duration}`); } catch {}
    await bot.sendMessage(chatId, `✅ Premium granted to ${targetId} for ${duration}.`);
    return;
  }

  if (cmd === "/revokepremium") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /revokepremium <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.premium.active = false;
    u.premium.expiresAt = undefined;
    u.premium.plan = undefined;
    await u.save();
    await bot.sendMessage(chatId, `✅ Premium revoked from ${targetId}.`);
    return;
  }

  if (cmd === "/banuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /banuser <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.banned = true;
    await u.save();
    await bot.sendMessage(chatId, `✅ User ${targetId} banned.`);
    return;
  }

  if (cmd === "/unbanuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /unbanuser <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.banned = false;
    await u.save();
    await bot.sendMessage(chatId, `✅ User ${targetId} unbanned.`);
    return;
  }

  if (cmd === "/clearuserdata") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /clearuserdata <user_id>"); return; }
    await Memory.deleteMany({ userId: targetId });
    await bot.sendMessage(chatId, `✅ Memory cleared for user ${targetId}.`);
    return;
  }

  if (cmd === "/dm" || cmd === "/messageuser") {
    const targetId = parseInt(args[0]);
    const message = args.slice(1).join(" ").trim();
    if (isNaN(targetId) || !message) {
      await bot.sendMessage(chatId,
        "Usage: /dm <user_id> <message>\n\nExample: /dm 123456789 Hey, thanks for using Nova!"
      );
      return;
    }
    try {
      await bot.sendMessage(targetId, `📨 Message from Nova's owner:\n\n${message}`);
      await bot.sendMessage(chatId, `✅ Message delivered to user ${targetId}.`, { reply_markup: backToOwnerKeyboard() });
    } catch (err: any) {
      const reason = err?.response?.body?.description || err?.message || "Unknown error";
      await bot.sendMessage(chatId,
        `❌ Could not reach user ${targetId}.\n\nReason: ${reason}\n\nThey may have blocked the bot.`,
        { reply_markup: backToOwnerKeyboard() }
      );
    }
    return;
  }

  if (cmd === "/growth") {
    const lines: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const from = new Date(Date.now() - (i + 1) * 86400000);
      const to   = new Date(Date.now() - i * 86400000);
      const count = await User.countDocuments({ firstSeen: { $gte: from, $lt: to } });
      const day = from.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const bar = "█".repeat(Math.min(count, 20)) || "·";
      lines.push(`${day}: ${bar} ${count}`);
    }
    await bot.sendMessage(chatId, `📈 New Users — Last 7 Days\n\n${lines.join("\n")}`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/topusers") {
    const top = await User.find({ isOwner: false, banned: false })
      .sort({ totalMessages: -1 }).limit(10)
      .select("userId username firstName totalMessages totalImages").lean();
    if (!top.length) { await bot.sendMessage(chatId, "No users yet."); return; }
    const lines = top.map((u, i) => {
      const name = u.username ? `@${u.username}` : (u.firstName || `User ${u.userId}`);
      return `${i + 1}. ${name} — ${u.totalMessages ?? 0} msgs, ${u.totalImages ?? 0} imgs`;
    });
    await bot.sendMessage(chatId, `🏆 Top 10 Most Active Users (All-time)\n\n${lines.join("\n")}`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/revenue") {
    const premPlans = await User.aggregate([
      { $match: { "premium.active": true, isOwner: false } },
      { $group: { _id: "$premium.plan", count: { $sum: 1 } } },
    ]);
    const total = await User.countDocuments({ "premium.active": true, isOwner: false });
    const lines = premPlans.map((p: any) => `• ${p._id || "unknown"}: ${p.count} users`);
    await bot.sendMessage(chatId,
      `💰 Revenue Overview\n\nActive premium users: ${total}\n\nBreakdown by plan:\n${lines.join("\n") || "No data"}\n\n_Check your Telegram Stars balance in @BotFather for exact earnings._`,
      { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/setmodel") {
    const model = args.join(" ").trim();
    if (!model) { await bot.sendMessage(chatId, "Usage: /setmodel <model-name>\nExample: /setmodel meta-llama/llama-3.3-70b-instruct"); return; }
    const cfg = await getOrCreateBotConfig();
    const old = cfg.activeChatModel;
    cfg.activeChatModel = model;
    await cfg.save();
    invalidateBotConfigCache();
    await bot.sendMessage(chatId, `✅ AI model updated!\n\nOld: ${old}\nNew: ${model}\n\nChange is live immediately.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/setlimit") {
    if (args.length < 3) {
      await bot.sendMessage(chatId, "Usage: /setlimit <free|premium> <images|messages|builds> <number>\nExample: /setlimit free images 5\nExample: /setlimit premium messages 200");
      return;
    }
    const tier = args[0].toLowerCase();
    const type = args[1].toLowerCase();
    const val  = parseInt(args[2]);
    if (!["free", "premium"].includes(tier) || !["images", "messages", "builds"].includes(type) || isNaN(val) || val < 0) {
      await bot.sendMessage(chatId, "Invalid input. Tier: free|premium. Type: images|messages|builds. Value: number >= 0.");
      return;
    }
    const cfg = await getOrCreateBotConfig();
    const key = `${tier === "free" ? "free" : "premium"}${type.charAt(0).toUpperCase() + type.slice(1)}` as keyof typeof cfg.usageLimits;
    (cfg.usageLimits as any)[key] = val;
    cfg.markModified("usageLimits");
    await cfg.save();
    invalidateBotConfigCache();
    await bot.sendMessage(chatId, `✅ Limit updated!\n\n${tier.charAt(0).toUpperCase() + tier.slice(1)} ${type}: ${val}/day\n\nLive immediately.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/setrewards") {
    const sub = args[0]?.toLowerCase();
    const period = args[1]?.toLowerCase();

    if (!sub || (sub !== "weekly" && sub !== "monthly")) {
      const cfg = await getOrCreateBotConfig();
      const r = cfg.leaderboardRewards ?? {};
      const wVIP     = (r as any).weeklyVIP     ?? [30, 14, 7];
      const wCreds   = (r as any).weeklyCredits ?? 50;
      const mVIP     = (r as any).monthlyVIP    ?? [90, 30, 14];
      const mCreds   = (r as any).monthlyCredits ?? 150;
      await bot.sendMessage(chatId,
        `🏅 Leaderboard Rewards\n\n` +
        `📅 Weekly:\n• 🥇 #1 → ${wVIP[0] ?? 30}d VIP\n• 🥈 #2 → ${wVIP[1] ?? 14}d VIP\n• 🥉 #3 → ${wVIP[2] ?? 7}d VIP\n• #4–10 → ${wCreds} credits\n\n` +
        `🗓 Monthly:\n• 🥇 #1 → ${mVIP[0] ?? 90}d VIP\n• 🥈 #2 → ${mVIP[1] ?? 30}d VIP\n• 🥉 #3 → ${mVIP[2] ?? 14}d VIP\n• #4–10 → ${mCreds} credits\n\n` +
        `To change:\n` +
        `/setrewards weekly vip 30 14 7\n` +
        `/setrewards weekly credits 50\n` +
        `/setrewards monthly vip 90 30 14\n` +
        `/setrewards monthly credits 150`,
        { reply_markup: backToOwnerKeyboard() }
      );
      return;
    }

    const cfg = await getOrCreateBotConfig();
    const r = cfg.leaderboardRewards as any ?? {};

    if (period === "vip") {
      const d1 = parseInt(args[2]), d2 = parseInt(args[3]), d3 = parseInt(args[4]);
      if (isNaN(d1) || isNaN(d2) || isNaN(d3) || d1 <= 0 || d2 <= 0 || d3 <= 0) {
        await bot.sendMessage(chatId, `Usage: /setrewards ${sub} vip <days1> <days2> <days3>\nExample: /setrewards ${sub} vip 30 14 7`);
        return;
      }
      r[sub === "weekly" ? "weeklyVIP" : "monthlyVIP"] = [d1, d2, d3];
      cfg.markModified("leaderboardRewards");
      await cfg.save();
      invalidateBotConfigCache();
      await bot.sendMessage(chatId, `✅ ${sub.charAt(0).toUpperCase() + sub.slice(1)} VIP rewards updated!\n🥇 #1 → ${d1}d\n🥈 #2 → ${d2}d\n🥉 #3 → ${d3}d`, { reply_markup: backToOwnerKeyboard() });
      return;
    }

    if (period === "credits") {
      const val = parseInt(args[2]);
      if (isNaN(val) || val < 0) {
        await bot.sendMessage(chatId, `Usage: /setrewards ${sub} credits <amount>\nExample: /setrewards ${sub} credits 75`);
        return;
      }
      r[sub === "weekly" ? "weeklyCredits" : "monthlyCredits"] = val;
      cfg.markModified("leaderboardRewards");
      await cfg.save();
      invalidateBotConfigCache();
      await bot.sendMessage(chatId, `✅ ${sub.charAt(0).toUpperCase() + sub.slice(1)} credits (#4–10) updated to ${val} credits.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }

    await bot.sendMessage(chatId, `Usage:\n/setrewards weekly vip 30 14 7\n/setrewards weekly credits 50\n/setrewards monthly vip 90 30 14\n/setrewards monthly credits 150`);
    return;
  }

  if (cmd === "/resetlimits") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /resetlimits <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.usage.messages = 0;
    u.usage.images   = 0;
    u.usage.builds   = 0;
    u.usage.edits    = 0;
    u.usage.lastReset = new Date();
    await u.save();
    try { await bot.sendMessage(targetId, "🎁 Your daily limits have been reset by the owner! Enjoy your fresh start."); } catch {}
    await bot.sendMessage(chatId, `✅ Daily limits reset for user ${targetId}.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/botinfo") {
    const config = await getOrCreateBotConfig();
    const ok = (v: boolean) => (v ? "✅" : "❌");
    const hasOR = !!process.env.OPENROUTER_API_KEY;
    const hasHF = !!process.env.HUGGINGFACE_API_TOKEN;
    const hasMongo = !!process.env.MONGODB_URI;
    const hasGH = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME);
    const hasVercel = !!process.env.VERCEL_TOKEN;
    const hasTG = !!process.env.TELEGRAM_BOT_TOKEN;
    await bot.sendMessage(chatId,
      `🤖 Nova Bot — Configuration Status\n\n` +
      `Core APIs:\n` +
      `${ok(hasTG)} Telegram Bot Token\n` +
      `${ok(hasOR)} OpenRouter (AI chat)\n` +
      `${ok(hasHF)} HuggingFace (images, TTS & STT)\n` +
      `${ok(hasMongo)} MongoDB (database)\n\n` +
      `Build & Deploy:\n` +
      `${ok(hasGH)} GitHub (repo push — /build)\n` +
      `${ok(hasVercel)} Vercel (deploy via /build → Deploy button)\n\n` +
      `Active Models:\n` +
      `🧠 ${config.activeChatModel}\n` +
      `🖼 ${config.activeImageModel}\n\n` +
      `Missing secrets can be added in Replit → Secrets panel.`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/searchuser") {
    const query = args[0]?.replace(/^@/, "").trim();
    if (!query) {
      await bot.sendMessage(chatId, "Usage: /searchuser <@username or name>\n\nExample: /searchuser @john or /searchuser John");
      return;
    }
    const u = await User.findOne({
      $or: [
        { username: { $regex: `^${query}$`, $options: "i" } },
        { firstName: { $regex: query, $options: "i" } },
      ],
    });
    if (!u) {
      await bot.sendMessage(chatId, `No user found matching "${query}".\n\nTip: Use /lookup <user_id> for exact ID lookup.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    await bot.sendMessage(chatId,
      `👤 Search Result\n\n` +
      `ID: ${u.userId}\nName: ${u.firstName || "N/A"}\nUsername: ${u.username ? "@" + u.username : "N/A"}\n` +
      `Premium: ${u.premium.active ? `Yes (${u.premium.plan || "?"})` : "No"}\nBanned: ${u.banned ? "Yes" : "No"}\n` +
      `Warnings: ${u.warnings}\nMessages: ${u.usage.messages}  |  Images: ${u.usage.images}\n` +
      `First seen: ${formatDate(u.firstSeen)}\nLast seen: ${formatDate(u.lastSeen)}`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/listscheduled") {
    if (scheduledBroadcasts.size === 0) {
      await bot.sendMessage(chatId, "No scheduled broadcasts pending.", { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const list = Array.from(scheduledBroadcasts.keys())
      .map((id, i) => `${i + 1}. ID: ${id}`)
      .join("\n");
    await bot.sendMessage(chatId,
      `📋 Scheduled Broadcasts (${scheduledBroadcasts.size})\n\n${list}\n\nTo cancel one:\n/cancelschedule <id>`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }

  if (cmd === "/cancelschedule") {
    const schedId = args[0];
    if (!schedId) {
      await bot.sendMessage(chatId, "Usage: /cancelschedule <id>\n\nGet IDs with /listscheduled", { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const timer = scheduledBroadcasts.get(schedId);
    if (!timer) {
      await bot.sendMessage(chatId, `Schedule "${schedId}" not found or already sent.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    clearTimeout(timer);
    scheduledBroadcasts.delete(schedId);
    await bot.sendMessage(chatId, `✅ Scheduled broadcast cancelled.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/testai") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await bot.sendMessage(chatId,
        `❌ OPENROUTER_API_KEY is not set.\n\nAI chat cannot work without this.`,
        { reply_markup: backToOwnerKeyboard() }
      );
      return;
    }

    // Build the list: active model first, then all configured models, then hardcoded fallbacks
    const AI_FALLBACK_MODELS = [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-4-31b-it:free",
      "deepseek/deepseek-v4-flash:free",
      "microsoft/phi-4:free",
      "mistralai/mistral-7b-instruct:free",
      "meta-llama/llama-3.1-8b-instruct:free",
      "meta-llama/llama-3.2-3b-instruct:free",
    ];

    const cfg = await getOrCreateBotConfig();
    const activeModel = cfg.activeChatModel || AI_FALLBACK_MODELS[0];
    const configuredModelIds = cfg.chatModels.map((m) => m.id);
    const allModels = [
      activeModel,
      ...configuredModelIds.filter(m => m !== activeModel),
      ...AI_FALLBACK_MODELS.filter(m => m !== activeModel && !configuredModelIds.includes(m)),
    ];

    const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    const headerMsg = await bot.sendMessage(chatId,
      `🧪 *AI Model Diagnostic*\n\n` +
      `API key: \`${maskedKey}\`\n` +
      `Active model: \`${activeModel}\`\n` +
      `Models to test: ${allModels.length}\n\n` +
      `Pinging each model with a quick test message...`,
      { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
    );

    const testMessages = [
      { role: "system", content: "You are a helpful assistant. Be very brief." },
      { role: "user",   content: "Reply with exactly: OK" },
    ];

    const results: string[] = [];

    for (const model of allModels) {
      const isActive = model === activeModel;
      const label = isActive ? `${model} ⭐` : model;
      const startMs = Date.now();
      try {
        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          { model, messages: testMessages, max_tokens: 20, temperature: 0 },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.APP_URL || "https://nova-bot.replit.app",
              "X-Title": "Nova AI Bot",
            },
            timeout: 20000,
          }
        );
        const latency = Date.now() - startMs;
        const reply = (response.data?.choices?.[0]?.message?.content || "").trim().slice(0, 40);
        results.push(`✅ \`${label}\` — ${latency}ms\n   Reply: _${reply || "(empty)"}_`);
      } catch (err: any) {
        const latency = Date.now() - startMs;
        const status = err?.response?.status;
        const errMsg = err?.response?.data?.error?.message || err?.message || String(err);
        const code = status ? `HTTP ${status}` : err?.code || "ERR";
        results.push(`❌ \`${label}\` — ${latency}ms\n   Fail: ${code} — ${String(errMsg).slice(0, 60)}`);
      }
    }

    const summary = results.join("\n\n");
    const passing = results.filter(r => r.startsWith("✅")).length;
    const failing = results.length - passing;

    try {
      await bot.editMessageText(
        `🧪 *AI Model Test Results*\n\n` +
        `✅ Passing: ${passing}/${allModels.length}   ❌ Failing: ${failing}\n` +
        `Active model: \`${activeModel}\`\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        summary,
        {
          chat_id: chatId,
          message_id: headerMsg.message_id,
          parse_mode: "Markdown",
          reply_markup: backToOwnerKeyboard(),
        }
      );
    } catch {
      await bot.sendMessage(chatId,
        `🧪 *AI Model Results*\n\n${summary}`,
        { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
      );
    }
    return;
  }

  if (cmd === "/testbuild") {
    const testPrompts: Array<{ label: string; prompt: string }> = [
      { label: "Landing Page",   prompt: "a modern SaaS landing page with hero section, features grid, pricing table, and FAQ" },
      { label: "Portfolio",      prompt: "a personal portfolio website for a software developer with projects, skills, and contact form" },
      { label: "Business Site",  prompt: "a professional business website for a digital marketing agency with services, team, and contact" },
      { label: "Blog",           prompt: "a clean minimal blog website with article list, single post view, and category filter" },
    ];

    const customPrompt = args.join(" ").trim();
    const targets = customPrompt
      ? [{ label: "Custom", prompt: customPrompt }]
      : testPrompts;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await bot.sendMessage(chatId,
        `❌ OPENROUTER_API_KEY is not set.\n\nWebsite builder cannot run without this.`,
        { reply_markup: backToOwnerKeyboard() }
      );
      return;
    }

    const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    await bot.sendMessage(chatId,
      `🔬 *Website Builder Diagnostic*\n\n` +
      `API key: \`${maskedKey}\`\n` +
      `Tests queued: ${targets.length}\n\n` +
      `Running ${targets.map(t => t.label).join(", ")}...`,
      { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
    );

    const { generateProject } = await import("../services/projectGenerator.js");

    for (const target of targets) {
      const statusMsg = await bot.sendMessage(chatId,
        `⏳ Testing: *${target.label}*\nPrompt: _${target.prompt}_`,
        { parse_mode: "Markdown" }
      );

      const startMs = Date.now();

      let onStatusMsg = "";
      const onStatus = (s: string) => { onStatusMsg = s; };

      try {
        const project = await generateProject(target.prompt, apiKey, onStatus);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

        const fileList = project.files.map(f => `  • ${f.path} (${f.content.length} chars)`).join("\n");
        const result =
          `✅ *${target.label}* — SUCCESS (${elapsed}s)\n\n` +
          `📦 Name: ${project.name}\n` +
          `🏷 Type: ${project.type}\n` +
          `📄 Files (${project.files.length}):\n${fileList}\n\n` +
          `📝 ${project.description}\n\n` +
          `🚀 ${project.deploymentTip}`;

        await bot.editMessageText(result, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "Markdown",
        });

      } catch (err: any) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        const errText = err?.message || String(err);

        const result =
          `❌ *${target.label}* — FAILED (${elapsed}s)\n\n` +
          `Last status: ${onStatusMsg || "(none)"}\n\n` +
          `Error:\n\`\`\`\n${errText.slice(0, 800)}\n\`\`\``;

        await bot.editMessageText(result, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "Markdown",
        });
      }

      // Small gap between tests to avoid hitting rate limits
      if (targets.length > 1) await new Promise(r => setTimeout(r, 2000));
    }

    await bot.sendMessage(chatId,
      `🔬 Diagnostic complete.\n\nCheck server logs for full stage-by-stage details (▶ STAGE 1 through ▶ STAGE 7).`,
      { reply_markup: backToOwnerKeyboard() }
    );
    return;
  }
}

// ── Handle owner pending text inputs (from inline button flows) ───────────────

export async function handleOwnerPendingText(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  actionType: string,
  input: string,
  getMaintenance: () => boolean,
  setMaintenance: (v: boolean) => void,
  pendingData?: Record<string, string>
): Promise<void> {
  try {
    switch (actionType) {
      case "owner_lookup": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, "User not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        await bot.sendMessage(
          chatId,
          `👤 User Lookup\n\n` +
            `ID: ${u.userId}\nName: ${u.firstName || "N/A"}\nUsername: ${u.username ? "@" + u.username : "N/A"}\n` +
            `Premium: ${u.premium.active ? `Yes (${u.premium.plan || "?"})` : "No"}\nBanned: ${u.banned ? "Yes" : "No"}\n` +
            `Warnings: ${u.warnings}\nMood: ${u.mood || "N/A"}\nStyle: ${u.settings.style}\n` +
            `Messages: ${u.usage.messages}  |  Images: ${u.usage.images}\n` +
            `First seen: ${formatDate(u.firstSeen)}\nLast seen: ${formatDate(u.lastSeen)}\n` +
            `Feedback sent: ${u.feedbackCount || 0}`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_ban": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, "User not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        u.banned = true;
        await u.save();
        await bot.sendMessage(chatId, `✅ User ${targetId} (${u.firstName || "?"}) has been banned.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_unban": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, "User not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        u.banned = false;
        await u.save();
        await bot.sendMessage(chatId, `✅ User ${targetId} (${u.firstName || "?"}) has been unbanned.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_deleteuser": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        await User.deleteOne({ userId: targetId });
        await Memory.deleteMany({ userId: targetId });
        await bot.sendMessage(chatId, `✅ User ${targetId} and all data deleted.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_cleardata": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        await Memory.deleteMany({ userId: targetId });
        await bot.sendMessage(chatId, `✅ Memory cleared for user ${targetId}.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_grantpremium": {
        const parts = input.trim().split(/\s+/);
        const targetId = parseInt(parts[0]);
        const duration = parts[1]?.toLowerCase();
        if (isNaN(targetId) || !duration) {
          await bot.sendMessage(chatId, "❌ Format: user_id duration\nExample: 123456789 30d", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, "User not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        const days = parseDuration(duration);
        const expiresAt = days >= 99999 ? undefined : addDays(new Date(), days);
        u.premium.active = true;
        u.premium.expiresAt = expiresAt;
        u.premium.plan = duration;
        await u.save();
        try { await bot.sendMessage(targetId, `✨ You've been granted Premium!\nDuration: ${duration}`); } catch {}
        await bot.sendMessage(chatId, `✅ Premium granted to ${u.firstName || targetId} for ${duration}.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_revokepremium": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, "User not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        u.premium.active = false;
        u.premium.expiresAt = undefined;
        u.premium.plan = undefined;
        await u.save();
        await bot.sendMessage(chatId, `✅ Premium revoked from ${u.firstName || targetId}.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_broadcast": {
        const msg = input.trim();
        if (!msg) { await bot.sendMessage(chatId, "Message cannot be empty.", { reply_markup: backToOwnerKeyboard() }); return; }
        const allUsers = await User.find({ banned: false });
        let sent = 0, failed = 0;
        await bot.sendMessage(chatId, `📣 Broadcasting to ${allUsers.length} users...`);
        for (const u of allUsers) {
          try { await bot.sendMessage(u.userId, msg); sent++; } catch { failed++; }
          await new Promise((r) => setTimeout(r, 35));
        }
        await bot.sendMessage(chatId, `✅ Broadcast done!\nSent: ${sent}  |  Failed: ${failed}`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_announcement": {
        const msg = input.trim();
        if (!msg) { await bot.sendMessage(chatId, "Message cannot be empty.", { reply_markup: backToOwnerKeyboard() }); return; }
        const allUsers = await User.find({ banned: false });
        let sent = 0, failed = 0;
        await bot.sendMessage(chatId, `📢 Sending announcement to ${allUsers.length} users...`);
        for (const u of allUsers) {
          try { await bot.sendMessage(u.userId, `📢 NOVA ANNOUNCEMENT\n\n${msg}`); sent++; } catch { failed++; }
          await new Promise((r) => setTimeout(r, 35));
        }
        await bot.sendMessage(chatId, `✅ Announcement sent!\nSent: ${sent}  |  Failed: ${failed}`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_schedule": {
        const parts = input.trim().split(/\s+/);
        const mins = parseInt(parts[0]);
        const msg = parts.slice(1).join(" ");
        if (isNaN(mins) || mins < 1 || !msg) {
          await bot.sendMessage(chatId, "❌ Format: minutes message\nExample: 30 Hello everyone!", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const schedId = Date.now().toString();
        const timer = setTimeout(async () => {
          scheduledBroadcasts.delete(schedId);
          const allUsers = await User.find({ banned: false });
          let sent = 0, failed = 0;
          for (const u of allUsers) {
            try { await bot.sendMessage(u.userId, `📅 Scheduled message:\n\n${msg}`); sent++; } catch { failed++; }
            await new Promise((r) => setTimeout(r, 35));
          }
          await bot.sendMessage(chatId, `✅ Scheduled broadcast sent!\nSent: ${sent}  |  Failed: ${failed}`);
        }, mins * 60 * 1000);
        scheduledBroadcasts.set(schedId, timer);
        await bot.sendMessage(chatId, `⏰ Broadcast scheduled in ${mins} minute(s).\nMessage: "${msg.slice(0, 100)}"`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_createcode": {
        const parts = input.trim().split(/\s+/);
        const code = parts[0]?.toUpperCase();
        const duration = parts[1]?.toLowerCase();
        if (!code || !duration) {
          await bot.sendMessage(chatId, "❌ Format: CODE duration\nExample: NOVA-VIP 30d", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        if (!/^(\d+(d|m|y)|lifetime)$/.test(duration)) {
          await bot.sendMessage(chatId, "Invalid duration. Use: 1d, 7d, 30d, 90d, 1y, lifetime", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        if (await RedeemCode.findOne({ code })) {
          await bot.sendMessage(chatId, `Code "${code}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const durationDays = parseDuration(duration);
        const newCode = new RedeemCode({ code, duration, durationDays, createdBy: userId });
        await newCode.save();
        await bot.sendMessage(chatId, `✅ Code created!\n\nCode: ${code}\nDuration: ${duration} (${durationDays} days)\nUsers redeem with: /redeem ${code}`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_resetcode": {
        const code = input.trim().toUpperCase();
        const rc = await RedeemCode.findOne({ code });
        if (!rc) { await bot.sendMessage(chatId, "Code not found.", { reply_markup: backToOwnerKeyboard() }); return; }
        rc.used = false;
        rc.usedBy = undefined;
        rc.usedAt = undefined;
        await rc.save();
        await bot.sendMessage(chatId, `✅ Code ${code} reset and available again.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_deletegroup": {
        const gid = parseInt(input.trim());
        if (isNaN(gid)) { await bot.sendMessage(chatId, "Invalid group ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        await GroupSettings.deleteOne({ chatId: gid });
        await bot.sendMessage(chatId, `✅ Group ${gid} removed from database.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      // ── Promo group 3-step flow ──────────────────────────────────────────

      case "owner_add_promo_link": {
        const link = input.trim();
        if (!link.startsWith("http") || !link.includes("t.me/")) {
          await bot.sendMessage(chatId, `❌ That doesn't look like a valid Telegram link.\n\nExamples:\n• https://t.me/yourcommunity\n• https://t.me/+InviteCodeHere\n\nTry again:`, { reply_markup: backToOwnerKeyboard() });
          setPending(userId, "owner_add_promo_link");
          return;
        }
        setPending(userId, "owner_add_promo_title", { link });
        await bot.sendMessage(chatId,
          `✅ Link saved: ${link}\n\nNow send a *display name* for this group.\n\nThis is what users will see in the "Earn Coins" section.\n\nExample: Nova Official Community`,
          { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_promo_title": {
        const title = input.trim();
        if (!title || title.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Please give it a clear name.", { reply_markup: backToOwnerKeyboard() });
          setPending(userId, "owner_add_promo_title", { link: pendingData?.link ?? "" });
          return;
        }
        setPending(userId, "owner_add_promo_reward", { link: pendingData?.link ?? "", title });
        await bot.sendMessage(chatId,
          `✅ Name set: *${title}*\n\nNow send the *coin reward* amount — how many coins users earn for joining.\n\nExample: 50`,
          { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_promo_reward": {
        const reward = parseInt(input.trim());
        const link2 = pendingData?.link ?? "";
        const title2 = pendingData?.title ?? "";
        if (isNaN(reward) || reward < 1) {
          await bot.sendMessage(chatId, "❌ Invalid amount. Enter a positive number like 50.", { reply_markup: backToOwnerKeyboard() });
          setPending(userId, "owner_add_promo_reward", { link: link2, title: title2 });
          return;
        }
        if (!link2 || !title2) {
          await bot.sendMessage(chatId, "❌ Something went wrong. Start over from the dashboard.", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const promo = await addPromoGroup(title2, link2, reward, userId);
        await bot.sendMessage(chatId,
          `✅ Promo group added!\n\n*${title2}*\nLink: ${link2}\nReward: ${reward} 🪙\n\n📢 Broadcasting to all users now...`,
          { parse_mode: "Markdown", reply_markup: backToOwnerKeyboard() }
        );
        broadcastNewPromo(bot, promo).then(({ sent, failed }) => {
          bot.sendMessage(chatId, `📢 Broadcast complete!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`, { reply_markup: backToOwnerKeyboard() }).catch(() => {});
        }).catch(() => {});
        break;
      }

      // ── 2-Step model adding ──────────────────────────────────────────────

      case "owner_add_chat_step1": {
        const name = input.trim();
        if (!name || name.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Try again — e.g. GPT-4o or Claude 3.5", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        setPending(userId, "owner_add_chat_step2", { name });
        await bot.sendMessage(chatId,
          `✅ Name set to: "${name}"\n\n` +
          `Now paste the model ID from OpenRouter.\n\n` +
          `Examples:\n` +
          `• openai/gpt-4o\n` +
          `• anthropic/claude-3-5-sonnet\n` +
          `• meta-llama/llama-3.1-8b-instruct:free\n\n` +
          `Browse models at openrouter.ai/models`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_chat_step2": {
        const modelId = input.trim();
        const modelName = pendingData?.name;
        if (!modelId || !modelName) { await bot.sendMessage(chatId, "Something went wrong. Start over.", { reply_markup: backToOwnerKeyboard() }); return; }
        const config = await getOrCreateBotConfig();
        if (config.chatModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `A model with ID "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.chatModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        invalidateBotConfigCache();
        await bot.sendMessage(chatId, `✅ Chat model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 🧠 Chat Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_img_step1": {
        const name = input.trim();
        if (!name || name.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Try again — e.g. FLUX Dev or SD 3", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        setPending(userId, "owner_add_img_step2", { name });
        await bot.sendMessage(chatId,
          `✅ Name set to: "${name}"\n\n` +
          `Now paste the model ID from HuggingFace.\n\n` +
          `Examples:\n` +
          `• black-forest-labs/FLUX.1-dev\n` +
          `• stabilityai/stable-diffusion-3-medium-diffusers\n` +
          `• runwayml/stable-diffusion-v1-5\n\n` +
          `Browse models at huggingface.co/models?pipeline_tag=text-to-image`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_img_step2": {
        const modelId = input.trim();
        const modelName = pendingData?.name;
        if (!modelId || !modelName) { await bot.sendMessage(chatId, "Something went wrong. Start over.", { reply_markup: backToOwnerKeyboard() }); return; }
        const config = await getOrCreateBotConfig();
        if (config.imageModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `A model with ID "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.imageModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        invalidateBotConfigCache();
        await bot.sendMessage(chatId, `✅ Image model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 🖼 Image Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_code_step1": {
        const name = input.trim();
        if (!name || name.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Try again — e.g. DeepSeek Coder or Qwen3", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        setPending(userId, "owner_add_code_step2", { name });
        await bot.sendMessage(chatId,
          `✅ Name set to: "${name}"\n\n` +
          `Now paste the model ID from OpenRouter.\n\n` +
          `Examples:\n` +
          `• deepseek/deepseek-coder-v2:free\n` +
          `• qwen/qwen-2.5-coder-32b-instruct:free\n` +
          `• meta-llama/llama-3.3-70b-instruct:free\n\n` +
          `Browse models at openrouter.ai/models`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_code_step2": {
        const modelId = input.trim();
        const modelName = pendingData?.name;
        if (!modelId || !modelName) { await bot.sendMessage(chatId, "Something went wrong. Start over.", { reply_markup: backToOwnerKeyboard() }); return; }
        const config = await getOrCreateBotConfig();
        if (config.codeModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `A model with ID "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.codeModels.push({ id: modelId, name: modelName, active: false });
        config.markModified("codeModels");
        await config.save();
        invalidateBotConfigCache();
        await bot.sendMessage(chatId, `✅ Code model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 💻 Code Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      // ── Legacy single-step (kept for backwards compat) ──────────────────

      case "owner_add_chat_model": {
        const parts = input.trim().split("|");
        const modelId = parts[0]?.trim();
        const modelName = parts[1]?.trim();
        if (!modelId || !modelName) {
          await bot.sendMessage(chatId, "Format: model_id|Display Name\nExample: openai/gpt-4o|GPT-4o", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const config = await getOrCreateBotConfig();
        if (config.chatModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `Model "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.chatModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        invalidateBotConfigCache();
        await bot.sendMessage(chatId, `✅ Chat model "${modelName}" added.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_image_model": {
        const parts = input.trim().split("|");
        const modelId = parts[0]?.trim();
        const modelName = parts[1]?.trim();
        if (!modelId || !modelName) {
          await bot.sendMessage(chatId, "Format: model_id|Display Name", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const config = await getOrCreateBotConfig();
        config.imageModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        invalidateBotConfigCache();
        await bot.sendMessage(chatId, `✅ Image model "${modelName}" added.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_searchuser": {
        const query = input.trim().replace(/^@/, "");
        if (!query) { await bot.sendMessage(chatId, "Please send a @username or display name.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({
          $or: [
            { username: { $regex: `^${query}$`, $options: "i" } },
            { firstName: { $regex: query, $options: "i" } },
          ],
        });
        if (!u) {
          await bot.sendMessage(chatId, `No user found matching "${query}".`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        await bot.sendMessage(chatId,
          `👤 Search Result\n\nID: ${u.userId}\nName: ${u.firstName || "N/A"}\nUsername: ${u.username ? "@" + u.username : "N/A"}\n` +
          `Premium: ${u.premium.active ? "Yes" : "No"}\nBanned: ${u.banned ? "Yes" : "No"}\nWarnings: ${u.warnings}\n` +
          `Messages: ${u.usage.messages}  |  Images: ${u.usage.images}\nLast seen: ${formatDate(u.lastSeen)}`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_dm_step1": {
        const targetId = parseInt(input.trim());
        if (isNaN(targetId)) { await bot.sendMessage(chatId, "Invalid user ID. Please send a numeric Telegram user ID.", { reply_markup: backToOwnerKeyboard() }); return; }
        const u = await User.findOne({ userId: targetId });
        if (!u) { await bot.sendMessage(chatId, `User ${targetId} not found in database.`, { reply_markup: backToOwnerKeyboard() }); return; }
        setPending(userId, "owner_dm_step2", { targetId: String(targetId), targetName: u.firstName || u.username || String(targetId) });
        await bot.sendMessage(chatId,
          `📩 DM to ${u.firstName || u.username || targetId} (ID: ${targetId})\n\nNow send the message you want to deliver:`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_dm_step2": {
        const targetId = parseInt(pendingData?.targetId || "");
        const targetName = pendingData?.targetName || "User";
        const msg = input.trim();
        if (isNaN(targetId) || !msg) { await bot.sendMessage(chatId, "Something went wrong. Start over from the owner panel.", { reply_markup: backToOwnerKeyboard() }); return; }
        try {
          await bot.sendMessage(targetId, `📨 Message from Admin:\n\n${msg}`);
          await bot.sendMessage(chatId, `✅ Message delivered to ${targetName} (${targetId}).`, { reply_markup: backToOwnerKeyboard() });
        } catch {
          await bot.sendMessage(chatId, `❌ Failed to send — user may have blocked the bot.`, { reply_markup: backToOwnerKeyboard() });
        }
        break;
      }

      default:
        await bot.sendMessage(chatId, "Unknown action.", { reply_markup: backToOwnerKeyboard() });
    }
  } catch (err) {
    logger.error({ err, actionType }, "Error handling owner pending text");
    await bot.sendMessage(chatId, "Something went wrong. Try again.", { reply_markup: backToOwnerKeyboard() });
  }
}

// ── Daily stats report ────────────────────────────────────────────────────────

export async function sendDailyReport(bot: TelegramBot): Promise<void> {
  const ownerIdStr = process.env.OWNER_ID;
  if (!ownerIdStr) return;
  const ownerId = parseInt(ownerIdStr);

  try {
    const [totalUsers, activeToday, premiumUsers, bannedUsers, totalGroups] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } }),
      User.countDocuments({ "premium.active": true }),
      User.countDocuments({ banned: true }),
      GroupSettings.countDocuments(),
    ]);

    const usageResult = await User.aggregate([
      { $group: { _id: null, msgs: { $sum: "$usage.messages" }, imgs: { $sum: "$usage.images" } } },
    ]);
    const usage = usageResult[0] || { msgs: 0, imgs: 0 };

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    await bot.sendMessage(
      ownerId,
      `📊 Daily Nova Report — ${today}\n\n` +
        `Total users: ${totalUsers}\n` +
        `Active today: ${activeToday}\n` +
        `Premium users: ${premiumUsers}\n` +
        `Banned users: ${bannedUsers}\n` +
        `Groups: ${totalGroups}\n` +
        `Messages today: ${usage.msgs}\n` +
        `Images today: ${usage.imgs}`,
      { reply_markup: backToOwnerKeyboard() }
    );
  } catch (err) {
    logger.error({ err }, "Failed to send daily report");
  }
}
