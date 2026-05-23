import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { chat } from "../services/ai.js";
import { isRateLimited, isFloodDetected } from "../utils/rateLimiter.js";
import { safeSend, startTypingLoop } from "../utils/helpers.js";
import { track } from "../services/analytics.js";
import { logger } from "../../lib/logger.js";

// ── AFK system (in-memory, resets on restart) ─────────────────────────────────
const afkStore = new Map<number, { reason: string; since: number }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getGroupSettings(chatId: number) {
  let s = await GroupSettings.findOne({ chatId });
  if (!s) { s = new GroupSettings({ chatId }); await s.save(); }
  return s;
}

async function isAdmin(bot: TelegramBot, chatId: number, userId: number): Promise<boolean> {
  try {
    const m = await bot.getChatMember(chatId, userId);
    return ["administrator", "creator"].includes(m.status);
  } catch { return false; }
}

/**
 * Save group message senders to DB so future @username lookups work.
 * Also records which group the user was active in (needed for /messageall).
 */
async function trackGroupUser(from: TelegramBot.User, chatId?: number): Promise<void> {
  try {
    await User.findOneAndUpdate(
      { userId: from.id },
      {
        $set: {
          userId: from.id,
          ...(from.username && { username: from.username }),
          ...(from.first_name && { firstName: from.first_name }),
          ...(from.last_name && { lastName: from.last_name }),
          lastSeen: new Date(),
        },
        $setOnInsert: { firstSeen: new Date() },
        ...(chatId ? { $addToSet: { groups: chatId } } : {}),
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch { /* non-critical */ }
}

/**
 * When any @username appears in a group message, try to resolve and cache
 * their userId via getChat. This builds up the DB passively over time so that
 * moderation commands can find users even before they've messaged directly.
 */
async function cacheUsernameIfNew(bot: TelegramBot, username: string): Promise<void> {
  try {
    const clean = username.replace(/^@/, "");
    if (!clean) return;
    const safeClean = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await User.findOne({ username: new RegExp(`^${safeClean}$`, "i") });
    if (existing?.userId) return; // Already have their ID — nothing to do
    const info = await bot.getChat(`@${clean}`) as any;
    if (info?.id && typeof info.id === "number" && info.id > 0) {
      await User.findOneAndUpdate(
        { userId: info.id },
        {
          $set: {
            userId: info.id,
            username: info.username || clean,
            ...(info.first_name && { firstName: info.first_name }),
            ...(info.last_name && { lastName: info.last_name }),
            lastSeen: new Date(),
          },
          $setOnInsert: { firstSeen: new Date() },
        },
        { upsert: true }
      );
    }
  } catch { /* privacy-protected or API error — silently skip */ }
}

/**
 * Resolve target user for moderation.
 * Priority: reply → text_mention entity → @mention entity → plain @username / numeric ID in args
 *
 * @username resolution order:
 *   1. Our DB (populated from all seen messages + passive mention caching)
 *   2. Group admin list
 *   3. Telegram getChat (works for users with public profiles)
 *
 * Users who have never sent a message in any group the bot is in AND have
 * disabled "find me by username" in Telegram privacy settings cannot be
 * resolved by username — reply-to-message always works for those cases.
 */
async function resolveTarget(
  bot: TelegramBot,
  chatId: number,
  msg: TelegramBot.Message,
  args: string[]
): Promise<{ userId: number; displayName: string } | null> {
  // 1. Reply to message — always works, never fails
  if (msg.reply_to_message?.from) {
    const u = msg.reply_to_message.from;
    if (u.username) trackGroupUser(u, chatId).catch(() => {});
    return { userId: u.id, displayName: u.username ? `@${u.username}` : (u.first_name || String(u.id)) };
  }

  // 2. text_mention entity (no-username users — Telegram gives us full user object)
  if (msg.entities) {
    for (const e of msg.entities) {
      if (e.type === "text_mention" && e.user) {
        trackGroupUser(e.user, chatId).catch(() => {});
        return { userId: e.user.id, displayName: e.user.first_name || String(e.user.id) };
      }
    }
  }

  // ── Unified @username resolver ─────────────────────────────────────────────
  // Works for: @mention entities in the message text, or plain @username / ID in args
  async function resolveUsername(username: string): Promise<{ userId: number; displayName: string } | null> {
    const clean = username.replace(/^@/, "").trim();
    if (!clean) return null;
    const safeUsername = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // a) Our DB — populated from every message we've ever seen + passive caching
    const dbUser = await User.findOne({ username: new RegExp(`^${safeUsername}$`, "i") });
    if (dbUser) return { userId: dbUser.userId, displayName: `@${clean}` };

    // b) Current group admin list
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const match = admins.find(a => a.user.username?.toLowerCase() === clean.toLowerCase());
      if (match) {
        trackGroupUser(match.user, chatId).catch(() => {});
        return { userId: match.user.id, displayName: `@${clean}` };
      }
    } catch {}

    // c) Telegram getChat — works for users with public profiles
    try {
      const info = await bot.getChat(`@${clean}`) as any;
      if (info?.id && typeof info.id === "number" && info.id > 0) {
        // Cache it so future lookups are instant
        cacheUsernameIfNew(bot, clean).catch(() => {});
        return { userId: info.id, displayName: `@${clean}` };
      }
    } catch {}

    return null;
  }

  // 3. @mention entity in message text (e.g. /ban @username)
  if (msg.entities && msg.text) {
    for (const e of msg.entities) {
      if (e.type === "mention") {
        const username = msg.text.substring(e.offset, e.offset + e.length);
        // Skip the command itself if it somehow appears as a mention
        if (username.toLowerCase() === `@${msg.text.split("@")[0].slice(1).toLowerCase()}`) continue;
        const result = await resolveUsername(username);
        if (result) return result;
      }
    }
  }

  // 4. args[0] — plain @username or numeric Telegram ID
  if (args[0]) {
    const raw = args[0].trim();

    // Numeric ID — always works
    if (/^\d+$/.test(raw)) return { userId: parseInt(raw, 10), displayName: `User ${raw}` };

    // @username or plain username
    if (raw.startsWith("@") || /^[a-zA-Z0-9_]{4,}$/.test(raw)) {
      const result = await resolveUsername(raw);
      if (result) return result;
    }
  }

  return null;
}

// ── Best-effort DM helper ─────────────────────────────────────────────────────
// Never throws — silently drops if user blocked the bot or DMs are closed.
async function tryDM(bot: TelegramBot, userId: number, text: string): Promise<void> {
  try { await bot.sendMessage(userId, text); } catch { /* privacy settings or not started */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleGroupMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  botUsername: string,
  maintenanceMode: boolean
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || "";
  const fromId = msg.from!.id;

  // Track every sender for future @username resolution + group membership
  if (msg.from) trackGroupUser(msg.from, chatId).catch(() => {});

  // Passively cache any @usernames mentioned in this message so moderation
  // commands can resolve them later even if they haven't messaged directly
  if (msg.entities && msg.text) {
    for (const e of msg.entities) {
      if (e.type === "mention") {
        const mentioned = msg.text.substring(e.offset, e.offset + e.length);
        cacheUsernameIfNew(bot, mentioned).catch(() => {});
      }
    }
  }

  const groupSettings = await getGroupSettings(chatId);
  if (groupSettings.title !== msg.chat.title) {
    groupSettings.title = msg.chat.title || undefined;
    await groupSettings.save();
  }

  // Strip @BotName suffix: /ban@Novabyolabot → /ban
  const rawCmd = text.split(" ")[0];
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const args = text.trim().split(/\s+/).slice(1);

  const senderIsAdmin = await isAdmin(bot, chatId, fromId);

  // ── AFK auto-clear: when an AFK user sends any message ───────────────────
  if (afkStore.has(fromId) && cmd !== "/afk" && cmd !== "/back") {
    const afkEntry = afkStore.get(fromId)!;
    afkStore.delete(fromId);
    const displayName = user.firstName || msg.from?.first_name || "User";
    const durationMins = Math.max(0, Math.round((Date.now() - afkEntry.since) / 60000));
    const durationStr = durationMins < 60 ? `${durationMins}m` : `${Math.round(durationMins / 60)}h`;
    const backMsg = await bot.sendMessage(chatId, `👋 ${displayName} is back! (was AFK for ${durationStr})`).catch(() => null);
    if (backMsg) setTimeout(() => bot.deleteMessage(chatId, backMsg.message_id).catch(() => {}), 10000);
  }

  // ── Anti-link middleware ──────────────────────────────────────────────────
  if (groupSettings.antilink && !senderIsAdmin) {
    const hasLink = /https?:\/\/|t\.me\//i.test(text) ||
      msg.entities?.some(e => e.type === "url" || e.type === "text_link");
    if (hasLink && !cmd.startsWith("/")) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        const warn = await bot.sendMessage(chatId, `⚠️ ${user.firstName || "User"}: links are not allowed in this group.`);
        setTimeout(() => bot.deleteMessage(chatId, warn.message_id).catch(() => {}), 5000);
      } catch {}
      return;
    }
  }

  // ── Anti-flood middleware ─────────────────────────────────────────────────
  if (groupSettings.antiflood && !senderIsAdmin && !cmd.startsWith("/")) {
    if (isFloodDetected(fromId, chatId, groupSettings.floodLimit)) {
      try {
        await bot.restrictChatMember(chatId, fromId, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(Date.now() / 1000) + 60,
        });
        const warn = await bot.sendMessage(chatId, `🔇 ${user.firstName || "User"} was muted 1 min for flooding.`);
        setTimeout(() => bot.deleteMessage(chatId, warn.message_id).catch(() => {}), 6000);
      } catch {}
      return;
    }
  }

  // ── Word filter middleware ────────────────────────────────────────────────
  if (groupSettings.wordFilter?.length && !senderIsAdmin && !cmd.startsWith("/")) {
    const lowerText = text.toLowerCase();
    const hit = groupSettings.wordFilter.find(w => lowerText.includes(w.toLowerCase()));
    if (hit) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        const warn = await bot.sendMessage(chatId, `⚠️ ${user.firstName || "User"}: that word is not allowed in this group.`);
        setTimeout(() => bot.deleteMessage(chatId, warn.message_id).catch(() => {}), 5000);
      } catch {}
      return;
    }
  }

  // ── Locked group middleware ───────────────────────────────────────────────
  if (groupSettings.locked && !senderIsAdmin && !cmd.startsWith("/")) {
    try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
    return;
  }

  // ── Public commands ───────────────────────────────────────────────────────

  if (cmd === "/help") {
    await bot.sendMessage(chatId,
      "Nova Group Commands\n\n" +
      "Everyone:\n" +
      "/id — Show your Telegram ID & group ID\n" +
      "/admins — List group admins\n" +
      "/info — Group information & Nova settings\n" +
      "/rules — Show group rules\n" +
      "/report — Report a message (reply to it)\n" +
      "/fact — Random mind-blowing fact\n" +
      "/quote — Inspiring quote\n" +
      "/tip — Productivity tip\n" +
      "/afk [reason] — Mark yourself as AFK\n" +
      "/back — Remove your AFK status\n" +
      "/summarize — Summarize your AI conversation\n\n" +
      "AI (mention @Nova or reply to it):\n" +
      "@Nova /image <prompt> — Generate image\n" +
      "@Nova /ask <question> — Ask anything\n" +
      "@Nova /translate <text> — Translate to English\n" +
      "@Nova /search <query> — Web search\n" +
      "@Nova /voice <text> — Convert text to speech\n" +
      "@Nova /describe — Send a photo for AI description\n" +
      "@Nova /sticker <desc> — Generate sticker\n\n" +
      "Admin — Settings:\n" +
      "/ai on|off — Toggle AI replies\n" +
      "/style friendly|funny|serious|balanced\n" +
      "/lang <code> — Set AI language (en ar fr es de zh hi pt auto)\n" +
      "/welcome <text> — Set welcome msg ({name} {group})\n" +
      "/setgoodbye <text> — Set goodbye msg\n" +
      "/setrules <text> — Set group rules\n" +
      "/lock / /unlock — Lock or unlock the group\n" +
      "/slowmode <sec> — Set slow mode (0 = off)\n" +
      "/antilink on|off — Delete messages with links\n" +
      "/antiflood on|off [limit] — Auto-mute flood spammers\n" +
      "/captcha on|off — Math captcha for new members\n" +
      "/autodelete on|off — Auto-delete join/leave messages\n" +
      "/setlimit <n> — Warn limit before auto-ban\n" +
      "/poll Q | Opt1 | Opt2 — Create a poll\n" +
      "/messageall <text> — DM all members privately\n" +
      "/addword <word> / /removeword / /wordlist — Word filter\n\n" +
      "Admin — Moderation:\n" +
      "/ban /unban /kick — Remove members\n" +
      "/mute [1m|1h|1d] / /unmute — Restrict messaging\n" +
      "/warn [reason] / /unwarn / /warnings / /clearwarn\n" +
      "/note <text> / /notes / /clearnotes — User notes (reply)\n" +
      "/purge <n> — Delete last N messages\n" +
      "/delete — Delete replied message\n" +
      "/pin / /unpin — Pin or unpin message\n" +
      "/promote / /demote — Change admin status\n\n" +
      "Tip: reply to a user's message for moderation commands — always the most reliable method."
    );
    return;
  }

  if (cmd === "/rules") {
    await bot.sendMessage(chatId, groupSettings.rules
      ? "Group Rules\n\n" + groupSettings.rules
      : "No rules set yet. Admins can use /setrules to add them.");
    return;
  }

  // /report (any user, replies to a message)
  if (cmd === "/report") {
    if (!msg.reply_to_message) {
      await bot.sendMessage(chatId, "Reply to a message to report it.");
      return;
    }
    const reporter = user.firstName || user.username || String(fromId);
    const reported = msg.reply_to_message.from;
    const reportedName = reported?.username ? `@${reported.username}` : (reported?.first_name || "Unknown");
    const reason = args.join(" ") || "No reason given";
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const adminList = admins.filter(a => !a.user.is_bot).map(a =>
        `<a href="tg://user?id=${a.user.id}">${a.user.first_name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a>`
      ).join(" ");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await bot.sendMessage(chatId,
        `🚨 Report\n\nReporter: ${esc(reporter)}\nReported: ${esc(reportedName)}\nReason: ${esc(reason)}\n\nAdmins notified: ${adminList}`,
        { parse_mode: "HTML" }
      );
    } catch {
      await bot.sendMessage(chatId, `Report filed: ${reportedName} reported by ${reporter}. Reason: ${reason}`);
    }
    return;
  }

  // ── AFK mention notification: when a message mentions an AFK user ─────────
  if (msg.entities && msg.text && afkStore.size > 0) {
    for (const e of msg.entities) {
      if (e.type === "mention") {
        const mentioned = msg.text.substring(e.offset, e.offset + e.length);
        const clean = mentioned.replace(/^@/, "").toLowerCase();
        if (clean === botUsername.toLowerCase()) continue;
        try {
          const safeClean = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const dbUser = await User.findOne({ username: new RegExp(`^${safeClean}$`, "i") });
          if (dbUser && afkStore.has(dbUser.userId)) {
            const afkInfo = afkStore.get(dbUser.userId)!;
            const afkMins = Math.max(0, Math.round((Date.now() - afkInfo.since) / 60000));
            const afkDur = afkMins < 60 ? `${afkMins}m ago` : `${Math.round(afkMins / 60)}h ago`;
            await bot.sendMessage(chatId, `💤 ${mentioned} is AFK${afkInfo.reason ? `: ${afkInfo.reason}` : ""} (${afkDur})`);
          }
        } catch {}
      }
    }
  }

  // /id — show Telegram user ID and group chat ID
  if (cmd === "/id") {
    const extra = msg.reply_to_message?.from
      ? `\nReplied user ID: ${msg.reply_to_message.from.id}`
      : "";
    await bot.sendMessage(chatId, `🆔 IDs\nYour ID: ${fromId}\nGroup ID: ${chatId}${extra}`);
    return;
  }

  // /admins — list group administrators
  if (cmd === "/admins") {
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const lines = admins
        .filter(a => !a.user.is_bot)
        .map(a => {
          const badge = a.status === "creator" ? "👑" : "⭐";
          const name = a.user.first_name + (a.user.last_name ? ` ${a.user.last_name}` : "");
          const uname = a.user.username ? ` (@${a.user.username})` : "";
          return `${badge} ${name}${uname}`;
        });
      await bot.sendMessage(chatId, lines.length
        ? `Group Admins\n━━━━━━━━━━━━\n${lines.join("\n")}`
        : "No admins found.");
    } catch {
      await bot.sendMessage(chatId, "Could not retrieve admin list.");
    }
    return;
  }

  // /info — group information and Nova settings
  if (cmd === "/info") {
    try {
      const chatInfo = await bot.getChat(chatId) as any;
      const memberCount = await bot.getChatMemberCount(chatId).catch(() => "?");
      const parts = [
        `ℹ️ Group Info\n━━━━━━━━━━━━`,
        `Title: ${chatInfo.title || "Unknown"}`,
        `ID: ${chatId}`,
        `Members: ${memberCount}`,
        chatInfo.description
          ? `About: ${chatInfo.description.slice(0, 80)}${chatInfo.description.length > 80 ? "…" : ""}`
          : null,
        `\nNova Settings:`,
        `AI: ${groupSettings.aiEnabled ? "✅ ON" : "❌ OFF"} · Style: ${groupSettings.style} · Lang: ${groupSettings.language}`,
        `Antilink: ${groupSettings.antilink ? "✅" : "❌"} · Antiflood: ${groupSettings.antiflood ? "✅" : "❌"}`,
        `Captcha: ${groupSettings.captchaEnabled ? "✅" : "❌"} · Lock: ${groupSettings.locked ? "🔒" : "🔓"}`,
        groupSettings.rules ? "Rules: ✅ Set" : null,
      ].filter(Boolean).join("\n");
      await bot.sendMessage(chatId, parts);
    } catch {
      await bot.sendMessage(chatId, "Could not retrieve group info.");
    }
    return;
  }

  // /fact — AI-generated mind-blowing fact
  if (cmd === "/fact") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(fromId, chatId + 1111,
      "Give me one mind-blowing fact. Just the fact itself, no intro text.",
      {
        style: "friendly", emoji: groupSettings.emoji, length: "short",
        language: groupSettings.language !== "auto" ? groupSettings.language : undefined,
      },
      user.premium.active
    );
    stopTyping();
    await safeSend(bot, chatId, `💡 ${reply}`, {
      reply_markup: { inline_keyboard: [[{ text: "📌 Pin this", callback_data: "grp_pin" }]] },
    });
    return;
  }

  // /quote — inspiring quote
  if (cmd === "/quote") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(fromId, chatId + 2222,
      `Give me one inspiring quote with attribution. Format: "Quote" — Author. Nothing else.`,
      {
        style: "friendly", emoji: false, length: "short",
        language: groupSettings.language !== "auto" ? groupSettings.language : undefined,
      },
      user.premium.active
    );
    stopTyping();
    await safeSend(bot, chatId, `✨ ${reply}`, {
      reply_markup: { inline_keyboard: [[{ text: "📌 Pin this", callback_data: "grp_pin" }]] },
    });
    return;
  }

  // /tip — productivity or life tip
  if (cmd === "/tip") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(fromId, chatId + 3333,
      "Give me one practical life or productivity tip. 2 sentences max, no fluff.",
      {
        style: "friendly", emoji: groupSettings.emoji, length: "short",
        language: groupSettings.language !== "auto" ? groupSettings.language : undefined,
      },
      user.premium.active
    );
    stopTyping();
    await safeSend(bot, chatId, `💡 ${reply}`, {
      reply_markup: { inline_keyboard: [[{ text: "📌 Pin this", callback_data: "grp_pin" }]] },
    });
    return;
  }

  // /afk [reason] — mark user as AFK
  if (cmd === "/afk") {
    const reason = args.join(" ").trim();
    afkStore.set(fromId, { reason, since: Date.now() });
    const displayName = user.firstName || msg.from?.first_name || "User";
    await bot.sendMessage(chatId,
      `💤 ${displayName} is now AFK${reason ? `: ${reason}` : ""}. They'll be notified when mentioned.`
    );
    return;
  }

  // /back — manually remove AFK status
  if (cmd === "/back") {
    if (!afkStore.has(fromId)) {
      await bot.sendMessage(chatId, "You are not currently marked as AFK.");
      return;
    }
    const afkEntry = afkStore.get(fromId)!;
    afkStore.delete(fromId);
    const displayName = user.firstName || msg.from?.first_name || "User";
    const durationMins = Math.max(0, Math.round((Date.now() - afkEntry.since) / 60000));
    const durationStr = durationMins < 60 ? `${durationMins}m` : `${Math.round(durationMins / 60)}h`;
    await bot.sendMessage(chatId, `👋 ${displayName} is back! (was AFK for ${durationStr})`);
    return;
  }

  // /summarize — summarize recent AI conversation history in this group
  if (cmd === "/summarize") {
    const stopTyping = startTypingLoop(bot, chatId);
    try {
      const { Memory } = await import("../models/Memory.js");
      const memory = await Memory.findOne({ userId: fromId, chatId });
      const msgs = memory?.messages?.slice(-10) ?? [];
      if (msgs.length < 2) {
        stopTyping();
        await bot.sendMessage(chatId,
          "No conversation history to summarize. Mention me or reply to my messages to build history."
        );
        return;
      }
      const convoText = msgs
        .map((m: any) => `${m.role === "user" ? "User" : "Nova"}: ${String(m.content).slice(0, 200)}`)
        .join("\n");
      const summary = await chat(fromId, chatId + 8888,
        `Summarize this conversation in 3-5 bullet points. Be concise:\n\n${convoText}`,
        {
          style: "serious", emoji: groupSettings.emoji, length: "short",
          language: groupSettings.language !== "auto" ? groupSettings.language : undefined,
        },
        user.premium.active
      );
      stopTyping();
      await safeSend(bot, chatId, `📝 Summary\n\n${summary}`, {
        reply_markup: { inline_keyboard: [[{ text: "📌 Pin this", callback_data: "grp_pin" }]] },
      });
    } catch {
      stopTyping();
      await bot.sendMessage(chatId, "Could not summarize. Please try again.");
    }
    return;
  }

  // ── Admin-only commands ───────────────────────────────────────────────────

  const adminCmds = new Set([
    "/ban", "/unban", "/mute", "/unmute", "/warn", "/unwarn", "/warnings",
    "/clearwarn", "/kick", "/pin", "/unpin", "/delete", "/purge",
    "/promote", "/demote", "/ai", "/lock", "/unlock", "/welcome",
    "/setrules", "/style", "/slowmode", "/antilink", "/antiflood",
    "/setlimit", "/note", "/notes", "/clearnotes", "/messageall",
    "/setgoodbye", "/poll", "/captcha", "/autodelete",
    "/addword", "/removeword", "/wordlist", "/lang",
  ]);

  if (!adminCmds.has(cmd)) {
    // Not an admin command — fall through to AI logic below
  } else {
    if (!senderIsAdmin) {
      await bot.sendMessage(chatId, "Only group admins can use this command.");
      return;
    }

    // /ai on|off
    if (cmd === "/ai") {
      const val = args[0]?.toLowerCase();
      if (val === "on") { groupSettings.aiEnabled = true; await groupSettings.save(); await bot.sendMessage(chatId, "AI replies are now ON."); }
      else if (val === "off") { groupSettings.aiEnabled = false; await groupSettings.save(); await bot.sendMessage(chatId, "AI replies are now OFF."); }
      else await bot.sendMessage(chatId, `AI is currently ${groupSettings.aiEnabled ? "ON" : "OFF"}. Use /ai on or /ai off`);
      return;
    }

    // /style
    if (cmd === "/style") {
      const valid = ["friendly", "funny", "serious", "balanced"];
      const chosen = args[0]?.toLowerCase();
      if (!chosen || !valid.includes(chosen)) { await bot.sendMessage(chatId, "Valid styles: friendly, funny, serious, balanced"); return; }
      groupSettings.style = chosen as any;
      await groupSettings.save();
      await bot.sendMessage(chatId, `Group AI style set to: ${chosen}`);
      return;
    }

    // /welcome
    if (cmd === "/welcome") {
      const welcomeText = args.join(" ");
      if (!welcomeText) {
        await bot.sendMessage(chatId, groupSettings.welcomeMessage
          ? `Current welcome:\n${groupSettings.welcomeMessage}\n\nPlaceholders: {name} {group}`
          : "No welcome message set. Example:\n/welcome Hey {name}, welcome to {group}!");
        return;
      }
      groupSettings.welcomeMessage = welcomeText;
      await groupSettings.save();
      await bot.sendMessage(chatId, "Welcome message updated.");
      return;
    }

    // /setgoodbye
    if (cmd === "/setgoodbye") {
      const goodbyeText = args.join(" ");
      if (!goodbyeText) {
        await bot.sendMessage(chatId, groupSettings.goodbyeMessage
          ? `Current goodbye:\n${groupSettings.goodbyeMessage}\n\nPlaceholders: {name} {group}`
          : "No goodbye message set. Example:\n/setgoodbye Goodbye {name}, we'll miss you in {group}!");
        return;
      }
      groupSettings.goodbyeMessage = goodbyeText;
      await groupSettings.save();
      await bot.sendMessage(chatId, "Goodbye message updated.");
      return;
    }

    // /poll
    if (cmd === "/poll") {
      const rawText = text.slice(cmd.length).trim();
      if (!rawText || !rawText.includes("|")) {
        await bot.sendMessage(chatId,
          "Usage: /poll Question | Option 1 | Option 2 | Option 3\n\n" +
          "Example:\n/poll Best color? | Red | Blue | Green"
        );
        return;
      }
      const parts = rawText.split("|").map((p: string) => p.trim()).filter(Boolean);
      const question = parts[0];
      const options = parts.slice(1);
      if (options.length < 2) {
        await bot.sendMessage(chatId, "A poll needs at least 2 options.\nExample: /poll Question | Option A | Option B");
        return;
      }
      if (options.length > 10) {
        await bot.sendMessage(chatId, "Maximum 10 options per poll.");
        return;
      }
      try {
        await (bot as any).sendPoll(chatId, question, options, { is_anonymous: false });
      } catch (err: any) {
        logger.error({ err: err?.message }, "Poll creation failed");
        await bot.sendMessage(chatId, "Failed to create poll. Make sure I have permission to send messages in this group.");
      }
      return;
    }

    // /addword <word> — add a word to the group filter
    if (cmd === "/addword") {
      const word = args[0]?.toLowerCase().trim();
      if (!word) { await bot.sendMessage(chatId, "Usage: /addword <word>"); return; }
      if (!groupSettings.wordFilter) groupSettings.wordFilter = [];
      if (groupSettings.wordFilter.includes(word)) {
        await bot.sendMessage(chatId, `"${word}" is already in the word filter.`);
        return;
      }
      groupSettings.wordFilter.push(word);
      await groupSettings.save();
      await bot.sendMessage(chatId, `✅ Added "${word}" to the word filter. Messages containing it will be auto-deleted.`);
      return;
    }

    // /removeword <word> — remove a word from the group filter
    if (cmd === "/removeword") {
      const word = args[0]?.toLowerCase().trim();
      if (!word) { await bot.sendMessage(chatId, "Usage: /removeword <word>"); return; }
      if (!groupSettings.wordFilter?.includes(word)) {
        await bot.sendMessage(chatId, `"${word}" is not in the word filter.`);
        return;
      }
      groupSettings.wordFilter = groupSettings.wordFilter.filter(w => w !== word);
      await groupSettings.save();
      await bot.sendMessage(chatId, `✅ Removed "${word}" from the word filter.`);
      return;
    }

    // /wordlist — show all filtered words
    if (cmd === "/wordlist") {
      if (!groupSettings.wordFilter?.length) {
        await bot.sendMessage(chatId, "No words in the filter. Use /addword <word> to add one.");
        return;
      }
      const list = groupSettings.wordFilter.map((w, i) => `${i + 1}. ${w}`).join("\n");
      await bot.sendMessage(chatId, `🚫 Filtered words (${groupSettings.wordFilter.length}):\n\n${list}\n\nUse /removeword <word> to remove.`);
      return;
    }

    // /setrules
    if (cmd === "/setrules") {
      const t = args.join(" ");
      if (!t) { await bot.sendMessage(chatId, "Usage: /setrules <text>"); return; }
      groupSettings.rules = t;
      await groupSettings.save();
      await bot.sendMessage(chatId, "Group rules updated.");
      return;
    }

    // /lock
    if (cmd === "/lock") {
      groupSettings.locked = true;
      await groupSettings.save();
      try {
        await bot.setChatPermissions(chatId, { can_send_messages: false });
        await bot.sendMessage(chatId, "Group is now LOCKED. Only admins can send messages.");
      } catch {
        await bot.sendMessage(chatId, "Group locked in Nova. Note: I need admin rights to set Telegram permissions too.");
      }
      return;
    }

    // /unlock
    if (cmd === "/unlock") {
      groupSettings.locked = false;
      await groupSettings.save();
      try {
        await bot.setChatPermissions(chatId, {
          can_send_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        });
        await bot.sendMessage(chatId, "Group is now UNLOCKED. Everyone can send messages.");
      } catch {
        await bot.sendMessage(chatId, "Group unlocked in Nova. Note: I need admin rights to restore Telegram permissions.");
      }
      return;
    }

    // /slowmode <seconds>
    if (cmd === "/slowmode") {
      const sec = parseInt(args[0] || "0");
      if (isNaN(sec) || sec < 0) { await bot.sendMessage(chatId, "Usage: /slowmode <seconds> (0 to disable)"); return; }
      groupSettings.slowmode = sec;
      await groupSettings.save();
      try {
        await (bot as any).setChatSlowMode?.(chatId, sec);
      } catch {}
      await bot.sendMessage(chatId, sec === 0 ? "Slow mode disabled." : `Slow mode set to ${sec} seconds.`);
      return;
    }

    // /antilink on|off
    if (cmd === "/antilink") {
      const val = args[0]?.toLowerCase();
      if (val !== "on" && val !== "off") { await bot.sendMessage(chatId, "Usage: /antilink on|off"); return; }
      groupSettings.antilink = val === "on";
      await groupSettings.save();
      await bot.sendMessage(chatId, `Anti-link is now ${val.toUpperCase()}. ${val === "on" ? "Messages with links will be deleted." : ""}`);
      return;
    }

    // /antiflood on|off [limit]
    if (cmd === "/antiflood") {
      const val = args[0]?.toLowerCase();
      if (val !== "on" && val !== "off") { await bot.sendMessage(chatId, "Usage: /antiflood on|off [messages_per_10s]\nExample: /antiflood on 5"); return; }
      groupSettings.antiflood = val === "on";
      if (args[1] && /^\d+$/.test(args[1])) groupSettings.floodLimit = Math.max(2, parseInt(args[1]));
      await groupSettings.save();
      await bot.sendMessage(chatId, `Anti-flood is now ${val.toUpperCase()}.${val === "on" ? ` Limit: ${groupSettings.floodLimit} msgs / 10 seconds.` : ""}`);
      return;
    }

    // /setlimit <n>
    if (cmd === "/setlimit") {
      const n = parseInt(args[0] || "");
      if (isNaN(n) || n < 1 || n > 20) { await bot.sendMessage(chatId, "Usage: /setlimit <1-20>\nDefault is 3 warnings before auto-ban."); return; }
      groupSettings.warnLimit = n;
      await groupSettings.save();
      await bot.sendMessage(chatId, `Warn limit set to ${n}. Users will be auto-banned after ${n} warnings.`);
      return;
    }

    // /pin
    if (cmd === "/pin") {
      if (!msg.reply_to_message) { await bot.sendMessage(chatId, "Reply to a message to pin it."); return; }
      try { await bot.pinChatMessage(chatId, msg.reply_to_message.message_id); await bot.sendMessage(chatId, "Message pinned."); }
      catch { await bot.sendMessage(chatId, "Failed to pin. Make sure I'm an admin with pin permission."); }
      return;
    }

    // /unpin
    if (cmd === "/unpin") {
      try { await bot.unpinChatMessage(chatId); await bot.sendMessage(chatId, "Latest pinned message unpinned."); }
      catch { await bot.sendMessage(chatId, "Failed to unpin."); }
      return;
    }

    // /delete
    if (cmd === "/delete") {
      if (!msg.reply_to_message) { await bot.sendMessage(chatId, "Reply to a message to delete it."); return; }
      try {
        await bot.deleteMessage(chatId, msg.reply_to_message.message_id);
        await bot.deleteMessage(chatId, msg.message_id);
      } catch { await bot.sendMessage(chatId, "Failed to delete. Make sure I have delete permission."); }
      return;
    }

    // /purge <n>
    if (cmd === "/purge") {
      const count = parseInt(args[0] || "");
      if (isNaN(count) || count < 1 || count > 100) { await bot.sendMessage(chatId, "Usage: /purge <1-100>"); return; }
      let deleted = 0;
      for (let i = msg.message_id; i > msg.message_id - count - 1 && i > 0; i--) {
        try { await bot.deleteMessage(chatId, i); deleted++; } catch {}
        await new Promise(r => setTimeout(r, 50)); // avoid Telegram rate limit (20 deletes/s)
      }
      const notice = await bot.sendMessage(chatId, `Purged ${deleted} message(s).`);
      setTimeout(() => bot.deleteMessage(chatId, notice.message_id).catch(() => {}), 3000);
      return;
    }

    // /note <text> — add admin note to a user (reply to their message)
    if (cmd === "/note") {
      if (!msg.reply_to_message?.from) { await bot.sendMessage(chatId, "Reply to a user's message to add a note."); return; }
      const noteText = args.join(" ");
      if (!noteText) { await bot.sendMessage(chatId, "Usage: /note <text> — reply to the user's message"); return; }
      const target = msg.reply_to_message.from;
      let dbUser = await User.findOne({ userId: target.id });
      if (!dbUser) { dbUser = new User({ userId: target.id, username: target.username, firstName: target.first_name }); }
      dbUser.notes.push(`[${new Date().toLocaleDateString()}] ${noteText}`);
      await dbUser.save();
      const displayName = target.username ? `@${target.username}` : target.first_name || String(target.id);
      await bot.sendMessage(chatId, `Note added for ${displayName}: "${noteText}"`);
      return;
    }

    // /notes — view notes for a user (reply or @username)
    if (cmd === "/notes") {
      const target = await resolveTarget(bot, chatId, msg, args);
      if (!target) { await bot.sendMessage(chatId, "Reply to the user's message or provide @username/ID."); return; }
      const dbUser = await User.findOne({ userId: target.userId });
      if (!dbUser || dbUser.notes.length === 0) {
        await bot.sendMessage(chatId, `No notes for ${target.displayName}.`);
        return;
      }
      await bot.sendMessage(chatId, `Notes for ${target.displayName}:\n\n${dbUser.notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`);
      return;
    }

    // /clearnotes — clear notes for a user
    if (cmd === "/clearnotes") {
      const target = await resolveTarget(bot, chatId, msg, args);
      if (!target) { await bot.sendMessage(chatId, "Reply to the user's message or provide @username/ID."); return; }
      const dbUser = await User.findOne({ userId: target.userId });
      if (dbUser) { dbUser.notes = []; await dbUser.save(); }
      await bot.sendMessage(chatId, `Notes cleared for ${target.displayName}.`);
      return;
    }

    // /messageall <text> — DM all members who have been active in this group
    if (cmd === "/messageall") {
      const messageText = args.join(" ");
      if (!messageText) {
        await bot.sendMessage(chatId,
          "Usage: /messageall <text>\n\nExample:\n/messageall Hey everyone! Check the pinned message.\n\n" +
          "The bot will privately DM every member who has been active in this group."
        );
        return;
      }

      // Find all non-banned users who have been active in this group
      const members = await User.find({ groups: chatId, banned: false });
      if (!members.length) {
        await bot.sendMessage(chatId,
          "No members to message yet. Members get recorded as they send messages in this group."
        );
        return;
      }

      const groupTitle = msg.chat.title || "your group";
      const senderName = msg.from?.first_name || msg.from?.username || "Admin";
      const formattedMsg =
        `Message from ${senderName} in ${groupTitle}:\n\n${messageText}`;

      // Confirm start
      const statusMsg = await bot.sendMessage(chatId,
        `Sending private messages to ${members.length} member(s)... This may take a moment.`
      );

      let sent = 0;
      let failed = 0;

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        try {
          await bot.sendMessage(member.userId, formattedMsg);
          sent++;
        } catch {
          // User may have blocked the bot or never started it
          failed++;
        }

        // Send 5 messages then pause 10 seconds to stay well within Telegram rate limits
        if ((i + 1) % 5 === 0 && i + 1 < members.length) {
          await new Promise(r => setTimeout(r, 10_000));
        } else {
          // Small gap between each message (30 msgs/sec max → ~35ms is safe)
          await new Promise(r => setTimeout(r, 50));
        }

        // Progress update every 50 messages for large groups
        if (members.length > 50 && (i + 1) % 50 === 0 && i + 1 < members.length) {
          try {
            await bot.editMessageText(
              `Sending messages... ${i + 1}/${members.length} done.`,
              { chat_id: chatId, message_id: statusMsg.message_id }
            );
          } catch {}
        }
      }

      // Update the status message with final result
      try {
        await bot.editMessageText(
          `Done! Private messages sent.\n\nDelivered: ${sent}\nCould not reach: ${failed}\n\n` +
          `(Members who blocked the bot or never started it cannot receive DMs.)`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );
      } catch {
        await bot.sendMessage(chatId,
          `Done! Delivered: ${sent} / Failed: ${failed}`
        );
      }
      return;
    }

    // /captcha on|off — math captcha for new group members
    if (cmd === "/captcha") {
      const val = args[0]?.toLowerCase();
      if (val !== "on" && val !== "off") {
        await bot.sendMessage(chatId,
          `Captcha is currently ${groupSettings.captchaEnabled ? "ON" : "OFF"}.\n` +
          "Usage: /captcha on|off\n\n" +
          "When ON: new members must solve a math problem to verify they're human."
        );
        return;
      }
      groupSettings.captchaEnabled = val === "on";
      await groupSettings.save();
      await bot.sendMessage(chatId,
        val === "on"
          ? "✅ Captcha is now ON. New members will receive a math challenge and be muted until they solve it."
          : "❌ Captcha is now OFF. New members will no longer receive a verification challenge."
      );
      return;
    }

    // /autodelete on|off — auto-delete service messages (join/leave)
    if (cmd === "/autodelete") {
      const val = args[0]?.toLowerCase();
      if (val !== "on" && val !== "off") {
        await bot.sendMessage(chatId,
          `Auto-delete service messages is currently ${groupSettings.autoDeleteServiceMessages ? "ON" : "OFF"}.\n` +
          "Usage: /autodelete on|off\n\n" +
          "When ON: join/leave notifications are automatically deleted."
        );
        return;
      }
      groupSettings.autoDeleteServiceMessages = val === "on";
      await groupSettings.save();
      await bot.sendMessage(chatId,
        val === "on"
          ? "✅ Auto-delete is ON. Join/leave service messages will be automatically deleted."
          : "❌ Auto-delete is OFF. Service messages will be kept."
      );
      return;
    }

    // Commands that need a target user ─────────────────────────────────────────
    const needsTarget = new Set(["/ban","/unban","/mute","/unmute","/warn","/unwarn","/warnings","/clearwarn","/kick","/promote","/demote"]);
    if (!needsTarget.has(cmd)) return;

    const target = await resolveTarget(bot, chatId, msg, args);
    if (!target) {
      await bot.sendMessage(chatId,
        "Could not find that user. Three ways to target someone:\n\n" +
        "1. Reply to their message then type the command — always works\n" +
        "2. " + cmd.slice(1) + " @username — works for most users\n" +
        "3. " + cmd.slice(1) + " 123456789 — use their Telegram ID\n\n" +
        "If @username still fails, the user has disabled username search in their " +
        "Telegram privacy settings. Ask them to send a message in the group first, " +
        "or use reply-to-message."
      );
      return;
    }

    // Safety checks — plain text only, NO parse_mode (usernames may contain underscores)
    const ownerIdStr = process.env.OWNER_ID;
    const ownerId = ownerIdStr ? parseInt(ownerIdStr, 10) : null;
    if (target.userId === fromId) { await bot.sendMessage(chatId, "You cannot use this command on yourself."); return; }
    if (ownerId && target.userId === ownerId) { await bot.sendMessage(chatId, "You cannot use this command on the bot owner."); return; }
    try { const me = await bot.getMe(); if (target.userId === me.id) { await bot.sendMessage(chatId, "I cannot perform actions on myself."); return; } } catch {}

    const targetIsAdmin = await isAdmin(bot, chatId, target.userId);
    if (targetIsAdmin && !["/warn", "/warnings", "/clearwarn"].includes(cmd)) {
      await bot.sendMessage(chatId, "Cannot perform this action on a group admin.");
      return;
    }

    const name = target.displayName;

    if (cmd === "/ban") {
      try {
        const groupName = msg.chat.title || "a group";
        // DM the user before banning (can't send DM after ban takes effect)
        await tryDM(bot, target.userId, `You have been banned from ${groupName}.`);
        await bot.banChatMember(chatId, target.userId);
        const dbUser = await User.findOne({ userId: target.userId });
        if (dbUser) { dbUser.banned = true; await dbUser.save(); }
        await bot.sendMessage(chatId, `${name} has been banned.`);
        track("ban", target.userId, chatId).catch(() => {});
      } catch (err: any) {
        logger.error({ err: err?.message, userId: target.userId }, "Ban failed");
        await bot.sendMessage(chatId, `Failed to ban ${name}. Make sure I am an admin with ban permission.`);
      }
      return;
    }

    if (cmd === "/unban") {
      try {
        await bot.unbanChatMember(chatId, target.userId);
        const dbUser = await User.findOne({ userId: target.userId });
        if (dbUser) { dbUser.banned = false; await dbUser.save(); }
        await tryDM(bot, target.userId, `You have been unbanned from ${msg.chat.title || "a group"}. You may rejoin.`);
        await bot.sendMessage(chatId, `${name} has been unbanned.`);
      } catch (err: any) {
        logger.error({ err: err?.message }, "Unban failed");
        await bot.sendMessage(chatId, `Failed to unban ${name}.`);
      }
      return;
    }

    if (cmd === "/kick") {
      try {
        const groupName = msg.chat.title || "a group";
        // DM before kicking (can't reach after removal)
        await tryDM(bot, target.userId, `You have been kicked from ${groupName}. You may rejoin using an invite link.`);
        await bot.banChatMember(chatId, target.userId);
        await bot.unbanChatMember(chatId, target.userId);
        await bot.sendMessage(chatId, `${name} has been kicked.`);
      } catch (err: any) {
        logger.error({ err: err?.message }, "Kick failed");
        await bot.sendMessage(chatId, `Failed to kick ${name}. Make sure I am an admin with ban permission.`);
      }
      return;
    }

    if (cmd === "/mute") {
      const durationArg = args.find(a => /^\d+(m|h|d)$/.test(a));
      let untilDate: number | undefined;
      let durationLabel = "";
      if (durationArg) {
        const match = durationArg.match(/^(\d+)(m|h|d)$/);
        if (match) {
          const n = parseInt(match[1]);
          const unit = match[2];
          const seconds = unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
          untilDate = Math.floor(Date.now() / 1000) + seconds;
          durationLabel = ` for ${durationArg}`;
        }
      }
      try {
        await bot.restrictChatMember(chatId, target.userId, {
          permissions: {
            can_send_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
          },
          until_date: untilDate,
        });
        const groupName = msg.chat.title || "a group";
        const dmMuteText = durationLabel
          ? `You have been muted in ${groupName} for ${durationArg}.`
          : `You have been muted in ${groupName}.`;
        await tryDM(bot, target.userId, dmMuteText);
        await bot.sendMessage(chatId, `${name} has been muted${durationLabel}.`);
        track("mute", target.userId, chatId).catch(() => {});
      } catch (err: any) {
        const msg400 = err?.message || "";
        if (msg400.includes("supergroup")) {
          await bot.sendMessage(chatId, `Muting requires a supergroup. Convert this group to a supergroup in Telegram settings first.`);
        } else {
          logger.error({ err: msg400 }, "Mute failed");
          await bot.sendMessage(chatId, `Failed to mute ${name}. Make sure I am an admin with restrict permission.`);
        }
      }
      return;
    }

    if (cmd === "/unmute") {
      try {
        await bot.restrictChatMember(chatId, target.userId, {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_send_polls: true,
            can_invite_users: true,
          },
        });
        await tryDM(bot, target.userId, `You have been unmuted in ${msg.chat.title || "a group"}. You can send messages again.`);
        await bot.sendMessage(chatId, `${name} has been unmuted.`);
      } catch (err: any) {
        const msg400 = err?.message || "";
        if (msg400.includes("supergroup")) {
          await bot.sendMessage(chatId, `Unmuting requires a supergroup. Convert this group in Telegram settings first.`);
        } else {
          logger.error({ err: msg400 }, "Unmute failed");
          await bot.sendMessage(chatId, `Failed to unmute ${name}.`);
        }
      }
      return;
    }

    if (cmd === "/warn") {
      let dbUser = await User.findOne({ userId: target.userId });
      if (!dbUser) { dbUser = new User({ userId: target.userId, username: target.displayName.replace(/^@/, ""), firstName: target.displayName.replace(/^@/, "") }); await dbUser.save(); }
      dbUser.warnings += 1;
      await dbUser.save();
      const reason = args.filter(a => !a.startsWith("@") && !/^\d+$/.test(a)).join(" ");
      // DM the warned user with full details
      const dmWarnLines = [
        `You have received a warning in ${msg.chat.title || "a group"}.`,
        reason ? `Reason: ${reason}` : "",
        `Warnings: ${dbUser.warnings}/${groupSettings.warnLimit}`,
        dbUser.warnings >= groupSettings.warnLimit
          ? "You have reached the warning limit and will be removed."
          : `${groupSettings.warnLimit - dbUser.warnings} more warning(s) before automatic removal.`,
      ].filter(Boolean).join("\n");
      await tryDM(bot, target.userId, dmWarnLines);
      // Brief group notice (no reason exposed publicly)
      await bot.sendMessage(chatId,
        `${name} has been warned. (${dbUser.warnings}/${groupSettings.warnLimit})`
      );
      if (dbUser.warnings >= groupSettings.warnLimit) {
        try {
          await bot.banChatMember(chatId, target.userId);
          dbUser.banned = true;
          await dbUser.save();
          await bot.sendMessage(chatId, `${name} was auto-banned after reaching ${groupSettings.warnLimit} warnings.`);
        } catch {
          await bot.sendMessage(chatId, `Auto-ban failed. Please ban ${name} manually.`);
        }
      }
      return;
    }

    if (cmd === "/warnings") {
      const dbUser = await User.findOne({ userId: target.userId });
      await bot.sendMessage(chatId, `${name} has ${dbUser?.warnings || 0} warning(s) out of ${groupSettings.warnLimit}.`);
      return;
    }

    if (cmd === "/clearwarn") {
      const dbUser = await User.findOne({ userId: target.userId });
      if (dbUser) { dbUser.warnings = 0; await dbUser.save(); }
      await bot.sendMessage(chatId, `Warnings cleared for ${name}.`);
      return;
    }

    if (cmd === "/unwarn") {
      let dbUser = await User.findOne({ userId: target.userId });
      if (!dbUser || dbUser.warnings <= 0) {
        await bot.sendMessage(chatId, `${name} has no warnings to remove.`);
        return;
      }
      dbUser.warnings = Math.max(0, dbUser.warnings - 1);
      await dbUser.save();
      await tryDM(bot, target.userId,
        `One warning has been removed in ${msg.chat.title || "a group"}. You now have ${dbUser.warnings}/${groupSettings.warnLimit} warnings.`
      );
      await bot.sendMessage(chatId,
        `One warning removed for ${name}. (${dbUser.warnings}/${groupSettings.warnLimit})`
      );
      return;
    }

    if (cmd === "/promote") {
      try {
        await bot.promoteChatMember(chatId, target.userId, {
          can_delete_messages: true,
          can_restrict_members: true,
          can_pin_messages: true,
          can_invite_users: true,
          can_change_info: true,
          can_manage_chat: true,
        });
        await bot.sendMessage(chatId, `${name} has been promoted to admin.`);
      } catch (err: any) {
        logger.error({ err: err?.message }, "Promote failed");
        await bot.sendMessage(chatId, `Failed to promote ${name}. Make sure I am an admin with promotion rights.`);
      }
      return;
    }

    if (cmd === "/demote") {
      try {
        await bot.promoteChatMember(chatId, target.userId, {
          can_delete_messages: false,
          can_restrict_members: false,
          can_pin_messages: false,
          can_invite_users: false,
          can_change_info: false,
          can_post_messages: false,
          can_edit_messages: false,
          can_manage_chat: false,
        });
        await bot.sendMessage(chatId, `${name} has been demoted.`);
      } catch (err: any) {
        logger.error({ err: err?.message }, "Demote failed");
        await bot.sendMessage(chatId, `Failed to demote ${name}.`);
      }
      return;
    }

    return;
  }

  // ── AI response (only when mentioned or replied to) ───────────────────────

  const isRepliedTo = msg.reply_to_message?.from?.username?.toLowerCase() === botUsername.toLowerCase();
  const isMentioned = text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);

  if (!isRepliedTo && !isMentioned) return;

  if (maintenanceMode) {
    await bot.sendMessage(chatId, "Nova is currently under maintenance. Check back soon!");
    return;
  }

  if (!groupSettings.aiEnabled) {
    await bot.sendMessage(chatId, "AI is currently OFF in this group. An admin can enable it with /ai on");
    return;
  }

  if (isRateLimited(fromId)) {
    await bot.sendMessage(chatId, "Slow down! Too many messages.");
    return;
  }

  const cleanText = text.replace(new RegExp(`@${botUsername}`, "gi"), "").trim();

  // ── Photo sent with bot mentioned — analyze the image ────────────────────
  if (msg.photo && msg.photo.length > 0) {
    if (!process.env.HUGGINGFACE_API_TOKEN) {
      await bot.sendMessage(chatId, "Image analysis is not configured.", { reply_to_message_id: msg.message_id });
      return;
    }
    try {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      const { downloadTelegramPhoto } = await import("../services/image.js");
      const { analyzeImage } = await import("../services/imageAnalysis.js");
      const imageBuffer = await downloadTelegramPhoto(bot, photoId);
      if (!imageBuffer) throw new Error("Download failed");
      const question = cleanText || "Describe this image in detail.";
      const statusMsg = await bot.sendMessage(chatId, "🔍 Analyzing image...", { reply_to_message_id: msg.message_id });
      const description = await analyzeImage(imageBuffer, question);
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.sendMessage(chatId, description ?? "I couldn't analyze that image.", { reply_to_message_id: msg.message_id });
    } catch {
      await bot.sendMessage(chatId, "Couldn't analyze that image. Please try again.", { reply_to_message_id: msg.message_id });
    }
    return;
  }

  if (!cleanText) return;

  // /image command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/image") || cleanText.toLowerCase().startsWith("/img")) {
    const prompt = cleanText.replace(/^\/(image|img)\s*/i, "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId,
        `Give me a prompt — e.g. @${botUsername} /image a futuristic city at night`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    if (!process.env.HUGGINGFACE_API_TOKEN) {
      await bot.sendMessage(chatId, "Image generation is not configured.", { reply_to_message_id: msg.message_id });
      return;
    }
    const sentMsg = await bot.sendMessage(chatId, `🎨 Generating image: "${prompt.slice(0, 60)}"...`);
    const stopImgTyping = startTypingLoop(bot, chatId, "upload_photo");
    try {
      const { generateImage } = await import("../services/image.js");
      const imgBuffer = await generateImage(prompt);
      stopImgTyping();
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      if (!imgBuffer) {
        await bot.sendMessage(chatId, "Image generation failed — model may be warming up. Try again in 30s.");
        return;
      }
      await bot.sendPhoto(chatId, imgBuffer, { caption: prompt });
    } catch (err) {
      stopImgTyping();
      logger.error({ err }, "Group image generation error");
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Image generation failed. Please try again.");
    }
    return;
  }

  // /ask command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/ask")) {
    const question = cleanText.replace(/^\/ask\s*/i, "").trim();
    if (!question) {
      await bot.sendMessage(chatId, "Ask me something — e.g. /ask What is the speed of light?", { reply_to_message_id: msg.message_id });
      return;
    }
    const stopTypingAsk = startTypingLoop(bot, chatId);
    const reply = await chat(fromId, chatId + 5555, question, {
      style: groupSettings.style,
      emoji: groupSettings.emoji,
      length: "short",
    }, user.premium.active);
    stopTypingAsk();
    await safeSend(bot, chatId, reply);
    return;
  }

  // /translate command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/translate") || cleanText.toLowerCase().startsWith("/tr")) {
    const textToTranslate = cleanText.replace(/^\/(translate|tr)\s*/i, "").trim();
    if (!textToTranslate) {
      await bot.sendMessage(chatId,
        `Provide text to translate — e.g. @${botUsername} /translate Bonjour le monde`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    const stopTypingTr = startTypingLoop(bot, chatId);
    const reply = await chat(fromId, chatId + 9999,
      `Translate the following to English. Only respond with the translation, nothing else:\n\n"${textToTranslate}"`,
      { style: "serious", emoji: false, length: "short" },
      user.premium.active
    );
    stopTypingTr();
    await safeSend(bot, chatId, `Translation:\n\n${reply}`);
    return;
  }

  // /build is private-only — redirect group users to DM
  if (cleanText.toLowerCase().startsWith("/build") || cleanText.toLowerCase().startsWith("/deploy")) {
    await bot.sendMessage(chatId,
      "The /build and /deploy commands are only available in private chat. DM me to use them.",
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // /search command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/search") || cleanText.toLowerCase().startsWith("/s ")) {
    const query = cleanText.replace(/^\/(search|s)\s*/i, "").trim();
    if (!query) {
      await bot.sendMessage(chatId,
        `What should I search?\nExample: @${botUsername} /search latest AI news`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    const statusMsg = await bot.sendMessage(chatId, `🔍 Searching: "${query.slice(0, 60)}"...`);
    const stopSearchTyping = startTypingLoop(bot, chatId);
    try {
      const { webSearch, formatSearchResults } = await import("../services/webSearch.js");
      const results = await webSearch(query);
      const raw = formatSearchResults(query, results);
      if (results.length === 0) {
        stopSearchTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        await bot.sendMessage(chatId, `No results found for: "${query}"`);
        return;
      }
      const aiPrompt = `Based on these web search results for "${query}":\n\n${raw}\n\nSummarize the key findings briefly and helpfully. Be concise.`;
      const aiReply = await chat(fromId, chatId + 7777, aiPrompt,
        { style: groupSettings.style, emoji: groupSettings.emoji, length: "short" },
        user.premium.active
      );
      stopSearchTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      const urls = results.slice(0, 2).map((r: any) => r.url).filter(Boolean).join("\n");
      await safeSend(bot, chatId, `🔍 ${query}\n\n${aiReply}${urls ? `\n\n${urls}` : ""}`);
    } catch (err) {
      stopSearchTyping();
      logger.error({ err }, "Group search error");
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Search failed. Please try again.");
    }
    return;
  }

  // /voice command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/voice")) {
    const text = cleanText.replace(/^\/voice\s*/i, "").trim();
    if (!text) {
      await bot.sendMessage(chatId,
        `Give me some text!\nExample: @${botUsername} /voice Hello, this is Nova speaking`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    const { getOrCreateBotConfig } = await import("../models/BotConfig.js");
    const config = await getOrCreateBotConfig();
    if (!config.features?.ttsEnabled) {
      await bot.sendMessage(chatId, "Voice generation is temporarily unavailable.", { reply_to_message_id: msg.message_id });
      return;
    }
    const sentMsg = await bot.sendMessage(chatId, `🔊 Generating voice...`);
    const stopVoiceTyping = startTypingLoop(bot, chatId, "record_voice");
    try {
      const { generateTTS } = await import("../services/tts.js");
      const provider = config.providers?.tts || "huggingface";
      const voice = config.providers?.ttsVoice || "nova";
      const audioBuffer = await generateTTS(text, provider, voice);
      stopVoiceTyping();
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      if (!audioBuffer) {
        await bot.sendMessage(chatId, "Voice generation failed. Try again.", { reply_to_message_id: msg.message_id });
        return;
      }
      await bot.sendVoice(chatId, audioBuffer);
    } catch (err) {
      stopVoiceTyping();
      logger.error({ err }, "Group TTS error");
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Voice generation failed. Please try again.");
    }
    return;
  }

  // /describe command when bot is mentioned (reply to a photo)
  if (cleanText.toLowerCase().startsWith("/describe")) {
    const replyMsg = msg.reply_to_message;
    if (!replyMsg?.photo) {
      await bot.sendMessage(chatId,
        `Reply to a photo with @${botUsername} /describe to get an AI description.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    const { getOrCreateBotConfig } = await import("../models/BotConfig.js");
    const config = await getOrCreateBotConfig();
    if (!config.features?.imageAnalysisEnabled) {
      await bot.sendMessage(chatId, "Image analysis is temporarily unavailable.", { reply_to_message_id: msg.message_id });
      return;
    }
    const photos = replyMsg.photo;
    const photo = photos[photos.length - 1];
    const sentMsg = await bot.sendMessage(chatId, "🔍 Analyzing image...");
    const stopDescribeTyping = startTypingLoop(bot, chatId, "upload_photo");
    try {
      const { downloadTelegramPhoto } = await import("../services/image.js");
      const { analyzeImage } = await import("../services/imageAnalysis.js");
      const imageBuffer = await downloadTelegramPhoto(bot, photo.file_id);
      if (!imageBuffer) {
        stopDescribeTyping();
        try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
        await bot.sendMessage(chatId, "Failed to download the image.", { reply_to_message_id: msg.message_id });
        return;
      }
      const rawAnalysis = await analyzeImage(imageBuffer);
      stopDescribeTyping();
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      if (!rawAnalysis) {
        await bot.sendMessage(chatId, "Could not analyze this image. Please try again.", { reply_to_message_id: replyMsg.message_id });
        return;
      }
      await bot.sendMessage(chatId, `🔍 ${rawAnalysis}`, { reply_to_message_id: replyMsg.message_id });
    } catch (err) {
      stopDescribeTyping();
      logger.error({ err }, "Group describe error");
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Image analysis failed. Please try again.");
    }
    return;
  }

  // /sticker command when bot is mentioned
  if (cleanText.toLowerCase().startsWith("/sticker")) {
    const prompt = cleanText.replace(/^\/sticker\s*/i, "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId,
        `Give me a description!\nExample: @${botUsername} /sticker cartoon rocket ship`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    if (!process.env.HUGGINGFACE_API_TOKEN) {
      await bot.sendMessage(chatId, "Sticker generation is not configured.", { reply_to_message_id: msg.message_id });
      return;
    }
    const sentMsg = await bot.sendMessage(chatId, `🎨 Creating sticker: "${prompt.slice(0, 50)}"...`);
    const stopStickerTyping = startTypingLoop(bot, chatId, "upload_photo");
    try {
      const { generateImage } = await import("../services/image.js");
      const imgBuffer = await generateImage(prompt + ", sticker style, white background, clean simple illustration");
      stopStickerTyping();
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      if (!imgBuffer) {
        await bot.sendMessage(chatId, "Sticker generation failed. Try again.");
        return;
      }
      await bot.sendPhoto(chatId, imgBuffer, { caption: `🎨 ${prompt}` });
    } catch (err) {
      stopStickerTyping();
      logger.error({ err }, "Group sticker error");
      try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Sticker generation failed. Please try again.");
    }
    return;
  }

  const stopTyping = startTypingLoop(bot, chatId);
  const reply = await chat(fromId, chatId, cleanText, {
    style: groupSettings.style,
    emoji: groupSettings.emoji,
    length: "short",
  }, user.premium.active, user.mood ?? undefined);
  stopTyping();

  await safeSend(bot, chatId, reply);
}
