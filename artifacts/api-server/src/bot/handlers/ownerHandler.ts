import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { getOrCreateBotConfig, invalidateBotConfigCache } from "../models/BotConfig.js";
import { addDays, formatDate } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { setPending } from "../utils/pendingActions.js";
import { logger } from "../../lib/logger.js";
import { ownerMainKeyboard, backToOwnerKeyboard, ownerGateGroupsKeyboard } from "../utils/keyboards.js";
import { getDailySummary, getTopCommands, getActiveUsers } from "../services/analytics.js";
import { addCredits, setCredits, resetCredits } from "../services/credits.js";
import { getMandatoryGroups, addMandatoryGroup, removeMandatoryGroup, setMandatoryGroupChatId } from "../services/groupGate.js";

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
    await sendOwnerPanel(bot, chatId, getMaintenance);
    return;
  }

  // ── Group Gate commands ────────────────────────────────────────────────────

  if (cmd === "/listgroups") {
    const groups = await getMandatoryGroups();
    if (groups.length === 0) {
      await bot.sendMessage(chatId, `🔒 No mandatory groups configured.\n\nUse /addgroup <name> | <link> to add one.\nExample:\n/addgroup Nova Community | https://t.me/+bw--Kb7qnwZiODJk`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const lines = groups.map((g, i) => {
      const idLabel = g.chatId ? `ID: ${g.chatId}` : `ID: not set (🔴 gate inactive)`;
      const strictLabel = g.strict ? "⛔ STRICT (blocks bot)" : "🔔 notification only";
      return `${i}. ${g.name}\n   Link: ${g.link}\n   ${idLabel}\n   Mode: ${strictLabel}`;
    }).join("\n\n");
    await bot.sendMessage(chatId, `🔒 Mandatory Groups (${groups.length})\n\n${lines}\n\n━━━━━━━━━━\nTo set a group's chat ID:\n/setgroupid <index> <chat_id>\n\nExample: /setgroupid 0 -1001234567890`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/addgroup") {
    const raw = args.join(" ");
    const parts = raw.split("|").map(p => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await bot.sendMessage(chatId, `Usage: /addgroup <name> | <link>\n\nExample:\n/addgroup Nova Community | https://t.me/+bw--Kb7qnwZiODJk\n\nNote: New groups added this way are notification-only (non-strict). The Nova group is always strict.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const [name, link] = parts;
    await addMandatoryGroup(name, link, 0, false);
    const groups = await getMandatoryGroups();
    const newIndex = groups.length - 1;
    await bot.sendMessage(chatId, `✅ Added group: "${name}"\nLink: ${link}\nMode: notification only (non-strict)\n\n⚠️ Gate is INACTIVE until you set the chat ID:\n/setgroupid ${newIndex} <chat_id>\n\nTo get the chat ID, add me to the group and forward a message here, or use a bot like @userinfobot.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/removegroup") {
    const idx = parseInt(args[0]);
    if (isNaN(idx)) {
      await bot.sendMessage(chatId, `Usage: /removegroup <index>\n\nGet indexes with /listgroups`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const groups = await getMandatoryGroups();
    if (idx < 0 || idx >= groups.length) {
      await bot.sendMessage(chatId, `❌ No group at index ${idx}. Use /listgroups to see valid indexes.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const name = groups[idx].name;
    const removed = await removeMandatoryGroup(idx);
    await bot.sendMessage(chatId, removed ? `✅ Removed group: "${name}"` : `❌ Failed to remove group.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/setgroupid") {
    const idx = parseInt(args[0]);
    const id = parseInt(args[1]);
    if (isNaN(idx) || isNaN(id)) {
      await bot.sendMessage(chatId, `Usage: /setgroupid <index> <chat_id>\n\nExample: /setgroupid 0 -1001234567890\n\nGet indexes with /listgroups\nChat IDs are negative numbers for groups/supergroups.`, { reply_markup: backToOwnerKeyboard() });
      return;
    }
    const ok = await setMandatoryGroupChatId(idx, id);
    await bot.sendMessage(chatId, ok ? `✅ Group ID set! The gate for group ${idx} is now ACTIVE.\n\nUsers not in the group will be blocked from using Nova.` : `❌ Invalid index. Use /listgroups to see valid indexes.`, { reply_markup: backToOwnerKeyboard() });
    return;
  }

  if (cmd === "/getgroupid") {
    await bot.sendMessage(chatId, `ℹ️ To find a group's chat ID:\n\n1. Add me to the group\n2. Forward any message from that group to me here\n3. I'll show you the chat ID\n\nOr use @userinfobot in the group to get the ID.`, { reply_markup: backToOwnerKeyboard() });
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
      await bot.sendMessage(chatId, "Usage: /redeemcd <CODE> <duration>\nExample: /redeemcd NOVA-VIP-01 30d");
      return;
    }
    const code = args[0].toUpperCase();
    const duration = args[1].toLowerCase();
    if (!/^(\d+(d|m|y)|lifetime)$/.test(duration)) {
      await bot.sendMessage(chatId, "Invalid duration. Use: 1d, 7d, 30d, 90d, 1y, lifetime");
      return;
    }
    try {
      if (await RedeemCode.findOne({ code })) {
        await bot.sendMessage(chatId, `Code "${code}" already exists.`);
        return;
      }
      const durationDays = parseDuration(duration);
      const newCode = new RedeemCode({ code, duration, durationDays, createdBy: user.userId });
      await newCode.save();
      await bot.sendMessage(chatId, `✅ Code created!\n\nCode: ${code}\nDuration: ${duration} (${durationDays} days)\n\nUsers redeem with: /redeem ${code}`);
    } catch (err: any) {
      logger.error({ err }, "Failed to create redeem code");
      await bot.sendMessage(chatId, `Failed to create code: ${err?.message || "Unknown error"}`);
    }
    return;
  }

  if (cmd === "/listcodes") {
    const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(20);
    if (!codes.length) { await bot.sendMessage(chatId, "No codes found."); return; }
    const lines = codes.map((c) => `${c.code} | ${c.duration} | ${c.used ? `Used by ${c.usedBy}` : "Available"}`);
    await bot.sendMessage(chatId, `🎟 Redeem Codes:\n\n${lines.join("\n")}`);
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
    const allUsers = await User.find({ banned: false });
    let sent = 0, failed = 0;
    await bot.sendMessage(chatId, `Broadcasting to ${allUsers.length} users...`);
    for (const u of allUsers) {
      try { await bot.sendMessage(u.userId, broadcastMsg); sent++; } catch { failed++; }
      await new Promise((r) => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `✅ Broadcast done!\nSent: ${sent}  |  Failed: ${failed}`);
    return;
  }

  if (cmd === "/announcement") {
    const announcementMsg = args.join(" ");
    if (!announcementMsg) { await bot.sendMessage(chatId, "Usage: /announcement <message>"); return; }
    const allUsers = await User.find({ banned: false });
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
      const allUsers = await User.find({ banned: false });
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
      `${ok(hasVercel)} Vercel (auto-deploy — /deploy)\n\n` +
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
