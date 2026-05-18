import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { addDays, formatDate } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { logger } from "../../lib/logger.js";

// In-memory scheduled broadcasts
const scheduledBroadcasts = new Map<string, NodeJS.Timeout>();

export async function handleOwnerMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  setMaintenance: (val: boolean) => void,
  getMaintenance: () => boolean
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const e = user.settings.emoji;
  const args = text.trim().split(/\s+/).slice(1);
  const cmd = text.trim().split(/\s+/)[0];

  // /owner or /dashboard
  if (cmd === "/owner" || cmd === "/dashboard") {
    const [totalUsers, premiumUsers, bannedUsers, totalCodes, usedCodes, totalGroups] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ "premium.active": true }),
      User.countDocuments({ banned: true }),
      RedeemCode.countDocuments(),
      RedeemCode.countDocuments({ used: true }),
      GroupSettings.countDocuments(),
    ]);
    await bot.sendMessage(chatId,
      `Owner Dashboard\n\n` +
      `Total Users: ${totalUsers}\n` +
      `Premium Users: ${premiumUsers}\n` +
      `Banned Users: ${bannedUsers}\n` +
      `Groups: ${totalGroups}\n` +
      `Redeem Codes: ${usedCodes}/${totalCodes} used\n` +
      `Maintenance: ${getMaintenance() ? "ON" : "OFF"}\n\n` +
      `User Commands:\n` +
      `/lookup <id> — Look up user\n` +
      `/userlist [page] — List recent users\n` +
      `/grantpremium <id> <dur> — Grant premium\n` +
      `/revokepremium <id> — Revoke premium\n` +
      `/banuser <id> — Ban user\n` +
      `/unbanuser <id> — Unban user\n` +
      `/deleteuser <id> — Delete user from DB\n` +
      `/clearuserdata <id> — Clear user memory\n\n` +
      `Code Commands:\n` +
      `/redeemcd <CODE> <dur> — Create code\n` +
      `/listcodes — List codes\n` +
      `/resetcode <CODE> — Reset (re-enable) a code\n\n` +
      `Broadcast Commands:\n` +
      `/broadcast <msg> — Send to all users\n` +
      `/announcement <msg> — Broadcast with header\n` +
      `/schedule <mins> <msg> — Schedule broadcast\n\n` +
      `Group Commands:\n` +
      `/grouplist — List all groups\n` +
      `/groupstats <chatId> — Group stats\n` +
      `/deletegroup <chatId> — Remove group from DB\n\n` +
      `Bot Commands:\n` +
      `/stats — Full stats\n` +
      `/getusage — Usage stats\n` +
      `/maintenance on|off — Toggle maintenance mode`
    );
    return;
  }

  // /stats
  if (cmd === "/stats") {
    const [totalUsers, premiumUsers, bannedUsers, activeToday, totalMemories, totalCodes, totalGroups] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ "premium.active": true }),
      User.countDocuments({ banned: true }),
      User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } }),
      Memory.countDocuments(),
      RedeemCode.countDocuments(),
      GroupSettings.countDocuments(),
    ]);
    await bot.sendMessage(chatId,
      `Bot Statistics\n\n` +
      `Users: ${totalUsers}\n` +
      `Active today: ${activeToday}\n` +
      `Premium: ${premiumUsers}\n` +
      `Banned: ${bannedUsers}\n` +
      `Groups: ${totalGroups}\n` +
      `Memory entries: ${totalMemories}\n` +
      `Redeem codes: ${totalCodes}\n` +
      `Maintenance: ${getMaintenance() ? "ON" : "OFF"}`
    );
    return;
  }

  // /getusage — total usage stats
  if (cmd === "/getusage") {
    const result = await User.aggregate([
      { $group: { _id: null, totalMessages: { $sum: "$usage.messages" }, totalImages: { $sum: "$usage.images" } } }
    ]);
    const stats = result[0] || { totalMessages: 0, totalImages: 0 };
    await bot.sendMessage(chatId,
      `Usage Statistics\n\n` +
      `Total messages sent: ${stats.totalMessages}\n` +
      `Total images generated: ${stats.totalImages}`
    );
    return;
  }

  // /maintenance on|off
  if (cmd === "/maintenance") {
    const val = args[0]?.toLowerCase();
    if (val !== "on" && val !== "off") {
      await bot.sendMessage(chatId, `Maintenance is currently ${getMaintenance() ? "ON" : "OFF"}.\nUsage: /maintenance on|off`);
      return;
    }
    setMaintenance(val === "on");
    await bot.sendMessage(chatId, `Maintenance mode turned ${val.toUpperCase()}. ${val === "on" ? "All users will see a maintenance message." : "Bot is back online for everyone."}`);
    return;
  }

  // /redeemcd <code> <duration>
  if (cmd === "/redeemcd") {
    if (args.length < 2) {
      await bot.sendMessage(chatId, "Usage: /redeemcd <CODE> <duration>\nDurations: 1d, 7d, 30d, 90d, 1y, lifetime\nExample: /redeemcd NOVA-VIP-01 30d");
      return;
    }
    const code = args[0].toUpperCase();
    const duration = args[1].toLowerCase();
    if (!/^(\d+(d|m|y)|lifetime)$/.test(duration)) {
      await bot.sendMessage(chatId, "Invalid duration. Use: 1d, 7d, 30d, 90d, 1m, 1y, lifetime");
      return;
    }
    if (await RedeemCode.findOne({ code })) {
      await bot.sendMessage(chatId, "Code already exists.");
      return;
    }
    const newCode = new RedeemCode({ code, duration, durationDays: parseDuration(duration), createdBy: user.userId });
    await newCode.save();
    await bot.sendMessage(chatId, `Code created!\nCode: ${code}\nDuration: ${duration}`);
    return;
  }

  // /listcodes
  if (cmd === "/listcodes") {
    const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(20);
    if (!codes.length) { await bot.sendMessage(chatId, "No codes found."); return; }
    const lines = codes.map(c => `${c.code} | ${c.duration} | ${c.used ? `Used by ${c.usedBy}` : "Available"}`);
    await bot.sendMessage(chatId, `Redeem Codes:\n\n${lines.join("\n")}`);
    return;
  }

  // /resetcode <code> — mark code as unused so it can be reused
  if (cmd === "/resetcode") {
    const code = args[0]?.toUpperCase();
    if (!code) { await bot.sendMessage(chatId, "Usage: /resetcode <CODE>"); return; }
    const rc = await RedeemCode.findOne({ code });
    if (!rc) { await bot.sendMessage(chatId, "Code not found."); return; }
    rc.used = false;
    rc.usedBy = undefined;
    rc.usedAt = undefined;
    await rc.save();
    await bot.sendMessage(chatId, `Code ${code} has been reset and is available again.`);
    return;
  }

  // /lookup <user_id>
  if (cmd === "/lookup") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /lookup <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    await bot.sendMessage(chatId,
      `User Lookup\n\n` +
      `ID: ${u.userId}\n` +
      `Name: ${u.firstName || "N/A"}\n` +
      `Username: ${u.username ? "@" + u.username : "N/A"}\n` +
      `Premium: ${u.premium.active ? "Yes" : "No"}\n` +
      `Premium plan: ${u.premium.plan || "N/A"}\n` +
      `Banned: ${u.banned ? "Yes" : "No"}\n` +
      `Warnings: ${u.warnings}\n` +
      `Mood: ${u.mood || "N/A"}\n` +
      `Language: ${u.settings.language || "en"}\n` +
      `Style: ${u.settings.style}\n` +
      `Notes: ${u.notes.length > 0 ? u.notes.join(" | ") : "None"}\n` +
      `First seen: ${formatDate(u.firstSeen)}\n` +
      `Last seen: ${formatDate(u.lastSeen)}\n` +
      `Messages: ${u.usage.messages}\n` +
      `Images: ${u.usage.images}\n` +
      `Feedback sent: ${u.feedbackCount || 0}`
    );
    return;
  }

  // /userlist [page]
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
    await bot.sendMessage(chatId, `Users (page ${page} of ${Math.ceil(total / perPage)}):\n\n${lines.join("\n")}\n\nNext: /userlist ${page + 1}`);
    return;
  }

  // /grouplist
  if (cmd === "/grouplist") {
    const groups = await GroupSettings.find().sort({ updatedAt: -1 }).limit(20);
    if (!groups.length) { await bot.sendMessage(chatId, "No groups found."); return; }
    const lines = groups.map((g, i) => `${i + 1}. ${g.title || "Unnamed"} (${g.chatId}) AI:${g.aiEnabled ? "on" : "off"}`);
    await bot.sendMessage(chatId, `Groups:\n\n${lines.join("\n")}`);
    return;
  }

  // /groupstats <chatId>
  if (cmd === "/groupstats") {
    const gid = parseInt(args[0]);
    if (isNaN(gid)) { await bot.sendMessage(chatId, "Usage: /groupstats <chatId>"); return; }
    const g = await GroupSettings.findOne({ chatId: gid });
    if (!g) { await bot.sendMessage(chatId, "Group not found."); return; }
    await bot.sendMessage(chatId,
      `Group: ${g.title || "Unnamed"}\n` +
      `Chat ID: ${g.chatId}\n` +
      `AI: ${g.aiEnabled ? "On" : "Off"}\n` +
      `Style: ${g.style}\n` +
      `Locked: ${g.locked ? "Yes" : "No"}\n` +
      `Anti-link: ${g.antilink ? "On" : "Off"}\n` +
      `Anti-flood: ${g.antiflood ? "On" : "Off"} (limit: ${g.floodLimit})\n` +
      `Warn limit: ${g.warnLimit}\n` +
      `Rules: ${g.rules ? "Set" : "Not set"}\n` +
      `Welcome: ${g.welcomeMessage ? "Set" : "Not set"}`
    );
    return;
  }

  // /deletegroup <chatId>
  if (cmd === "/deletegroup") {
    const gid = parseInt(args[0]);
    if (isNaN(gid)) { await bot.sendMessage(chatId, "Usage: /deletegroup <chatId>"); return; }
    await GroupSettings.deleteOne({ chatId: gid });
    await bot.sendMessage(chatId, `Group ${gid} removed from database.`);
    return;
  }

  // /deleteuser <user_id>
  if (cmd === "/deleteuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /deleteuser <user_id>"); return; }
    await User.deleteOne({ userId: targetId });
    await Memory.deleteMany({ userId: targetId });
    await bot.sendMessage(chatId, `User ${targetId} and all their data deleted.`);
    return;
  }

  // /broadcast <message>
  if (cmd === "/broadcast") {
    const broadcastMsg = args.join(" ");
    if (!broadcastMsg) { await bot.sendMessage(chatId, "Usage: /broadcast <message>"); return; }
    const allUsers = await User.find({ banned: false });
    let sent = 0, failed = 0;
    await bot.sendMessage(chatId, `Broadcasting to ${allUsers.length} users...`);
    for (const u of allUsers) {
      try { await bot.sendMessage(u.userId, broadcastMsg); sent++; } catch { failed++; }
      await new Promise(r => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `Broadcast done!\nSent: ${sent}\nFailed: ${failed}`);
    return;
  }

  // /announcement <message> — broadcast with a header
  if (cmd === "/announcement") {
    const announcementMsg = args.join(" ");
    if (!announcementMsg) { await bot.sendMessage(chatId, "Usage: /announcement <message>"); return; }
    const allUsers = await User.find({ banned: false });
    let sent = 0, failed = 0;
    await bot.sendMessage(chatId, `Sending announcement to ${allUsers.length} users...`);
    for (const u of allUsers) {
      try {
        await bot.sendMessage(u.userId,
          `ANNOUNCEMENT FROM NOVA\n\n${announcementMsg}`
        );
        sent++;
      } catch { failed++; }
      await new Promise(r => setTimeout(r, 35));
    }
    await bot.sendMessage(chatId, `Announcement sent!\nSent: ${sent}\nFailed: ${failed}`);
    return;
  }

  // /schedule <minutes> <message>
  if (cmd === "/schedule") {
    const mins = parseInt(args[0]);
    const schedMsg = args.slice(1).join(" ");
    if (isNaN(mins) || mins < 1 || !schedMsg) {
      await bot.sendMessage(chatId, "Usage: /schedule <minutes> <message>\nExample: /schedule 30 Hello everyone!");
      return;
    }
    const schedId = Date.now().toString();
    const timer = setTimeout(async () => {
      scheduledBroadcasts.delete(schedId);
      const allUsers = await User.find({ banned: false });
      let sent = 0, failed = 0;
      for (const u of allUsers) {
        try { await bot.sendMessage(u.userId, `Scheduled message:\n\n${schedMsg}`); sent++; } catch { failed++; }
        await new Promise(r => setTimeout(r, 35));
      }
      await bot.sendMessage(chatId, `Scheduled broadcast sent!\nSent: ${sent}\nFailed: ${failed}`);
    }, mins * 60 * 1000);
    scheduledBroadcasts.set(schedId, timer);
    await bot.sendMessage(chatId, `Broadcast scheduled to send in ${mins} minute(s).\nMessage: "${schedMsg.slice(0, 100)}"`);
    return;
  }

  // /grantpremium <user_id> <duration>
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
    try { await bot.sendMessage(targetId, `You have been granted Premium by the owner!\nDuration: ${duration}`); } catch {}
    await bot.sendMessage(chatId, `Premium granted to ${targetId} for ${duration}.`);
    return;
  }

  // /revokepremium <user_id>
  if (cmd === "/revokepremium") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /revokepremium <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.premium.active = false;
    u.premium.expiresAt = undefined;
    u.premium.plan = undefined;
    await u.save();
    await bot.sendMessage(chatId, `Premium revoked from ${targetId}.`);
    return;
  }

  // /banuser <user_id>
  if (cmd === "/banuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /banuser <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.banned = true;
    await u.save();
    await bot.sendMessage(chatId, `User ${targetId} banned from bot.`);
    return;
  }

  // /unbanuser <user_id>
  if (cmd === "/unbanuser") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /unbanuser <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    u.banned = false;
    await u.save();
    await bot.sendMessage(chatId, `User ${targetId} unbanned.`);
    return;
  }

  // /clearuserdata <user_id>
  if (cmd === "/clearuserdata") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /clearuserdata <user_id>"); return; }
    await Memory.deleteMany({ userId: targetId });
    await bot.sendMessage(chatId, `Memory cleared for user ${targetId}.`);
    return;
  }
}

/**
 * Sends a daily stats report to the owner.
 * Call this at midnight UTC every day.
 */
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
      { $group: { _id: null, msgs: { $sum: "$usage.messages" }, imgs: { $sum: "$usage.images" } } }
    ]);
    const usage = usageResult[0] || { msgs: 0, imgs: 0 };

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" });

    await bot.sendMessage(ownerId,
      `Daily Nova Report — ${today}\n\n` +
      `Total users: ${totalUsers}\n` +
      `Active today: ${activeToday}\n` +
      `Premium users: ${premiumUsers}\n` +
      `Banned users: ${bannedUsers}\n` +
      `Groups: ${totalGroups}\n` +
      `Messages today: ${usage.msgs}\n` +
      `Images today: ${usage.imgs}`
    );
  } catch (err) {
    logger.error({ err }, "Failed to send daily report");
  }
}
