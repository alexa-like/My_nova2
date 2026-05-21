import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { BotConfig, getOrCreateBotConfig } from "../models/BotConfig.js";
import { addDays, formatDate } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { setPending } from "../utils/pendingActions.js";
import { logger } from "../../lib/logger.js";
import { ownerMainKeyboard, backToOwnerKeyboard } from "../utils/keyboards.js";

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
  const activeVid = config.videoModels.find((m) => m.id === config.activeVideoModel)?.name || config.activeVideoModel;

  const text =
    `🤖 Nova Owner Dashboard\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Users: ${totalUsers}  |  💎 Premium: ${premiumUsers}\n` +
    `🚫 Banned: ${bannedUsers}  |  🏘 Groups: ${totalGroups}\n` +
    `🎟 Codes: ${usedCodes}/${totalCodes} used\n` +
    `🔧 Maintenance: ${getMaintenance() ? "🔴 ON" : "🟢 OFF"}\n\n` +
    `🧠 Chat Model: ${activeChat}\n` +
    `🖼 Image Model: ${activeImg}\n` +
    `🎬 Video Model: ${activeVid}`;

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

  if (cmd === "/lookup") {
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) { await bot.sendMessage(chatId, "Usage: /lookup <user_id>"); return; }
    const u = await User.findOne({ userId: targetId });
    if (!u) { await bot.sendMessage(chatId, "User not found."); return; }
    await bot.sendMessage(
      chatId,
      `👤 User Lookup\n\n` +
        `ID: ${u.userId}\nName: ${u.firstName || "N/A"}\nUsername: ${u.username ? "@" + u.username : "N/A"}\n` +
        `Premium: ${u.premium.active ? "Yes" : "No"}\nBanned: ${u.banned ? "Yes" : "No"}\n` +
        `Messages: ${u.usage.messages}  |  Images: ${u.usage.images}\n` +
        `First seen: ${formatDate(u.firstSeen)}\nLast seen: ${formatDate(u.lastSeen)}`
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
        await bot.sendMessage(chatId, `✅ Image model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 🖼 Image Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_vid_step1": {
        const name = input.trim();
        if (!name || name.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Try again.", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        setPending(userId, "owner_add_vid_step2", { name });
        await bot.sendMessage(chatId,
          `✅ Name set to: "${name}"\n\n` +
          `Now paste the model ID from HuggingFace.\n\n` +
          `Examples:\n` +
          `• damo-vilab/text-to-video-ms-1.7b\n` +
          `• ali-vilab/i2vgen-xl\n\n` +
          `Browse models at huggingface.co/models?pipeline_tag=text-to-video`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_vid_step2": {
        const modelId = input.trim();
        const modelName = pendingData?.name;
        if (!modelId || !modelName) { await bot.sendMessage(chatId, "Something went wrong. Start over.", { reply_markup: backToOwnerKeyboard() }); return; }
        const config = await getOrCreateBotConfig();
        if (config.videoModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `A model with ID "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.videoModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        await bot.sendMessage(chatId, `✅ Video model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 🎬 Video Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_voice_step1": {
        const name = input.trim();
        if (!name || name.length < 2) {
          await bot.sendMessage(chatId, "❌ Name too short. Try again — e.g. Crystal or Soft Female", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        setPending(userId, "owner_add_voice_step2", { name });
        await bot.sendMessage(chatId,
          `✅ Name set to: "${name}"\n\n` +
          `Now paste the HuggingFace TTS model ID.\n\n` +
          `Examples:\n` +
          `• facebook/mms-tts-eng\n` +
          `• espnet/kan-bayashi_ljspeech_vits\n` +
          `• facebook/fastspeech2-en-ljspeech\n\n` +
          `Browse models at huggingface.co/models?pipeline_tag=text-to-speech`,
          { reply_markup: backToOwnerKeyboard() }
        );
        break;
      }

      case "owner_add_voice_step2": {
        const modelId = input.trim();
        const modelName = pendingData?.name;
        if (!modelId || !modelName) { await bot.sendMessage(chatId, "Something went wrong. Start over.", { reply_markup: backToOwnerKeyboard() }); return; }
        const config = await getOrCreateBotConfig();
        if (config.voiceModels.find((m) => m.id === modelId)) {
          await bot.sendMessage(chatId, `A voice with ID "${modelId}" already exists.`, { reply_markup: backToOwnerKeyboard() });
          return;
        }
        config.voiceModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        await bot.sendMessage(chatId, `✅ Voice model added!\n\nName: ${modelName}\nID: ${modelId}\n\nHead to 🔊 Voice Model in the dashboard to activate it.`, { reply_markup: backToOwnerKeyboard() });
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
        await bot.sendMessage(chatId, `✅ Image model "${modelName}" added.`, { reply_markup: backToOwnerKeyboard() });
        break;
      }

      case "owner_add_video_model": {
        const parts = input.trim().split("|");
        const modelId = parts[0]?.trim();
        const modelName = parts[1]?.trim();
        if (!modelId || !modelName) {
          await bot.sendMessage(chatId, "Format: model_id|Display Name", { reply_markup: backToOwnerKeyboard() });
          return;
        }
        const config = await getOrCreateBotConfig();
        config.videoModels.push({ id: modelId, name: modelName, active: false });
        await config.save();
        await bot.sendMessage(chatId, `✅ Video model "${modelName}" added.`, { reply_markup: backToOwnerKeyboard() });
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
