import TelegramBot from "node-telegram-bot-api";
import { connectDB } from "./services/db.js";
import { ensureUser, isOwner } from "./middlewares/userMiddleware.js";
import { handlePrivateMessage, handlePhotoMessage, handleVoiceMessage, handleDocumentMessage } from "./handlers/privateHandler.js";
import { handleGroupMessage } from "./handlers/groupHandler.js";
import { handleOwnerMessage, sendDailyReport } from "./handlers/ownerHandler.js";
import { handleInlineQuery } from "./handlers/inlineHandler.js";
import { handleCallbackQuery } from "./handlers/callbackHandler.js";
import { GroupSettings } from "./models/GroupSettings.js";
import { isGroup, isPrivate } from "./utils/helpers.js";
import { track } from "./services/analytics.js";
import { getMaintenance, setMaintenance } from "./utils/maintenanceState.js";
import { loadPendingReminders } from "./services/reminder.js";
import { setPremiumEmojiEnabled } from "./utils/premiumEmoji.js";
import { logger } from "../lib/logger.js";

// ── In-memory captcha store ─────────────────────────────────────────────────
interface CaptchaChallenge {
  answer: number;
  messageId: number;
  expiresAt: number;
}
const captchaStore = new Map<string, CaptchaChallenge>(); // key: `chatId:userId`

function generateCaptcha(): { question: string; answer: number } {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const ops = [
    { q: `${a} + ${b}`, ans: a + b },
    { q: `${a + b} - ${b}`, ans: a },
    { q: `${a} × ${b}`, ans: a * b },
  ];
  const chosen = ops[Math.floor(Math.random() * ops.length)];
  return { question: chosen.q, answer: chosen.ans };
}

let bot: TelegramBot | null = null;

const OWNER_CMDS = new Set([
  "/owner", "/dashboard", "/stats", "/getusage", "/redeemcd", "/listcodes",
  "/resetcode", "/lookup", "/userlist", "/grouplist", "/groupstats",
  "/deletegroup", "/deleteuser", "/broadcast", "/announcement", "/schedule",
  "/grantpremium", "/revokepremium", "/banuser", "/unbanuser",
  "/clearuserdata", "/maintenance",
]);

export async function startBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot will not start");
    return;
  }

  await connectDB();

  bot = new TelegramBot(token, {
    polling: {
      interval: 1000,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  const botInfo = await bot.getMe();
  const botUsername = botInfo.username || "NovaBot";
  logger.info({ username: botUsername, id: botInfo.id }, "Nova bot started");

  loadPendingReminders(bot).catch((err) => logger.warn({ err }, "Failed to load reminders"));

  // Load premium emoji state from config
  try {
    const { getOrCreateBotConfig } = await import("./models/BotConfig.js");
    const cfg = await getOrCreateBotConfig();
    setPremiumEmojiEnabled(cfg.premiumEmojiEnabled ?? false);
  } catch { /* non-fatal */ }

  // ── Register bot command menus ─────────────────────────────────────────────
  try {
    await bot.setMyCommands([
      { command: "start", description: "Start Nova" },
      { command: "help", description: "Show all commands" },
      { command: "search", description: "Search the web" },
      { command: "image", description: "Generate an image" },
      { command: "video", description: "Generate a short video" },
      { command: "music", description: "Generate music" },
      { command: "sticker", description: "Create a sticker image" },
      { command: "ask", description: "Quick AI answer (no memory)" },
      { command: "history", description: "View conversation history" },
      { command: "remind", description: "Set a reminder (e.g. /remind 1h Call mom)" },
      { command: "reminders", description: "View upcoming reminders" },
      { command: "translate", description: "Translate text to English" },
      { command: "summarize", description: "Summarize conversation" },
      { command: "quote", description: "Get an inspiring quote" },
      { command: "fact", description: "Random fun fact" },
      { command: "tip", description: "Productivity tip" },
      { command: "mood", description: "Set your current mood" },
      { command: "feedback", description: "Send feedback to owner" },
      { command: "profile", description: "View your profile" },
      { command: "settings", description: "View your settings" },
      { command: "model", description: "Switch your AI chat model" },
      { command: "voice", description: "Configure voice reply settings" },
      { command: "premium", description: "Check premium status" },
      { command: "redeem", description: "Redeem a premium code" },
      { command: "forget", description: "Clear conversation memory" },
      { command: "style", description: "Change personality style" },
      { command: "length", description: "Change reply length" },
      { command: "emoji", description: "Toggle emojis on/off" },
      { command: "lang", description: "Set language" },
    ], { scope: { type: "all_private_chats" } });

    await bot.setMyCommands([
      { command: "help", description: "Show group commands" },
      { command: "rules", description: "Show group rules" },
      { command: "report", description: "Report a message (reply to it)" },
      { command: "ban", description: "Ban a user" },
      { command: "unban", description: "Unban a user" },
      { command: "mute", description: "Mute a user [duration: 10m 2h 1d]" },
      { command: "unmute", description: "Unmute a user" },
      { command: "kick", description: "Kick a user" },
      { command: "warn", description: "Warn a user" },
      { command: "warnings", description: "Check user warnings" },
      { command: "clearwarn", description: "Clear user warnings" },
      { command: "purge", description: "Delete last N messages" },
      { command: "pin", description: "Pin a message" },
      { command: "unpin", description: "Unpin latest pinned message" },
      { command: "delete", description: "Delete a message" },
      { command: "lock", description: "Lock group (admins only)" },
      { command: "unlock", description: "Unlock group" },
      { command: "slowmode", description: "Set slow mode" },
      { command: "captcha", description: "Toggle captcha for new members" },
      { command: "autodelete", description: "Auto-delete service messages" },
      { command: "image", description: "Generate an image (mention bot)" },
      { command: "ask", description: "Quick AI answer (mention bot)" },
      { command: "translate", description: "Translate text (mention bot)" },
      { command: "video", description: "Generate a video (mention bot)" },
      { command: "antilink", description: "Toggle anti-link protection" },
      { command: "antiflood", description: "Toggle anti-flood protection" },
      { command: "promote", description: "Promote user to admin" },
      { command: "demote", description: "Demote user from admin" },
      { command: "note", description: "Add note to user (reply)" },
      { command: "notes", description: "View user notes" },
      { command: "ai", description: "Toggle AI replies" },
      { command: "messageall", description: "DM all group members privately" },
      { command: "setgoodbye", description: "Set goodbye message" },
      { command: "poll", description: "Create a poll" },
    ], { scope: { type: "all_group_chats" } });

    logger.info("Bot command menus registered");
  } catch (err) {
    logger.warn({ err }, "Failed to register bot commands (non-fatal)");
  }

  // ── Message handler ────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.from || msg.from.is_bot) return;

    try {
      const user = await ensureUser(msg);

      const isCmd = msg.text?.startsWith("/");
      if (isCmd) {
        const cmdName = msg.text!.trim().split(/\s+/)[0];
        track("command", msg.from.id, msg.chat.id, { command: cmdName }).catch(() => {});
      } else {
        track("message", msg.from.id, msg.chat.id).catch(() => {});
      }

      if (isPrivate(msg)) {
        // Voice messages
        if (msg.voice) {
          await handleVoiceMessage(bot!, msg, user);
          return;
        }

        // Photo messages (image tools via button menu)
        if (msg.photo && !msg.text) {
          await handlePhotoMessage(bot!, msg, user);
          return;
        }

        // Document messages — PDF, TXT, DOCX, code files etc.
        if (msg.document) {
          await handleDocumentMessage(bot!, msg, user);
          return;
        }

        // Private chats: only process text messages beyond this point
        if (!msg.text) return;

        const cmd = msg.text.trim().split(/\s+/)[0].split("@")[0];
        if (isOwner(user) && OWNER_CMDS.has(cmd)) {
          await handleOwnerMessage(
            bot!, msg, user,
            (val) => setMaintenance(val),
            () => getMaintenance()
          );
        } else {
          await handlePrivateMessage(bot!, msg, user, getMaintenance());
        }
      } else if (isGroup(msg)) {
        // Check captcha answer in group messages
        if (msg.text) {
          const captchaKey = `${msg.chat.id}:${msg.from!.id}`;
          const challenge = captchaStore.get(captchaKey);
          if (challenge) {
            if (Date.now() > challenge.expiresAt) {
              captchaStore.delete(captchaKey);
              try {
                await bot!.banChatMember(msg.chat.id, msg.from!.id);
                await bot!.unbanChatMember(msg.chat.id, msg.from!.id);
              } catch {}
            } else {
              const answer = parseInt(msg.text.trim());
              if (!isNaN(answer) && answer === challenge.answer) {
                captchaStore.delete(captchaKey);
                try {
                  await bot!.restrictChatMember(msg.chat.id, msg.from!.id, {
                    permissions: {
                      can_send_messages: true,
                      can_send_other_messages: true,
                      can_add_web_page_previews: true,
                      can_send_polls: true,
                    },
                  });
                  await bot!.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
                  try { await bot!.deleteMessage(msg.chat.id, challenge.messageId); } catch {}
                  const name = msg.from!.first_name || msg.from!.username || "User";
                  await bot!.sendMessage(msg.chat.id, `✅ Welcome, ${name}! You've been verified.`);
                } catch {}
              } else {
                await bot!.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
              }
              return;
            }
          }
        }
        await handleGroupMessage(bot!, msg, user, botUsername, getMaintenance());
      }
    } catch (err) {
      logger.error({ err }, "Unhandled error in message handler");
    }
  });

  // ── New member welcome + captcha ───────────────────────────────────────────
  bot.on("new_chat_members", async (msg) => {
    if (!msg.new_chat_members) return;
    try {
      const groupSettings = await GroupSettings.findOne({ chatId: msg.chat.id });

      for (const member of msg.new_chat_members) {
        if (member.is_bot) continue;
        const chatId = msg.chat.id;
        const name = member.first_name || member.username || "Friend";
        const groupName = msg.chat.title || "this group";

        // Auto-delete the service "user joined" message
        if (groupSettings?.autoDeleteServiceMessages) {
          try { await bot!.deleteMessage(chatId, msg.message_id); } catch {}
        }

        // Captcha verification
        if (groupSettings?.captchaEnabled) {
          const captcha = generateCaptcha();
          const captchaKey = `${chatId}:${member.id}`;
          try {
            await bot!.restrictChatMember(chatId, member.id, {
              permissions: { can_send_messages: false },
            });
          } catch {}
          const challengeMsg = await bot!.sendMessage(chatId,
            `👋 Welcome, ${name}!\n\n` +
            `To verify you're human, please answer this math question:\n\n` +
            `🔢 What is: ${captcha.question} = ?\n\n` +
            `Reply with just the number. You have 2 minutes.`
          );
          captchaStore.set(captchaKey, {
            answer: captcha.answer,
            messageId: challengeMsg.message_id,
            expiresAt: Date.now() + 2 * 60 * 1000,
          });
          setTimeout(async () => {
            const remaining = captchaStore.get(captchaKey);
            if (remaining) {
              captchaStore.delete(captchaKey);
              try {
                await bot!.deleteMessage(chatId, challengeMsg.message_id);
                await bot!.banChatMember(chatId, member.id);
                await bot!.unbanChatMember(chatId, member.id);
                await bot!.sendMessage(chatId, `⏰ ${name} was removed for not completing the captcha.`);
              } catch {}
            }
          }, 2 * 60 * 1000);
          continue;
        }

        // Welcome message (only if no captcha)
        if (groupSettings?.welcomeMessage) {
          const welcome = groupSettings.welcomeMessage
            .replace(/\{name\}/g, name)
            .replace(/\{group\}/g, groupName);
          await bot!.sendMessage(chatId, welcome);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in new_chat_members handler");
    }
  });

  // ── Member left / goodbye ─────────────────────────────────────────────────
  bot.on("left_chat_member", async (msg) => {
    if (!msg.left_chat_member) return;
    try {
      const member = msg.left_chat_member;
      if (member.is_bot) return;
      const groupSettings = await GroupSettings.findOne({ chatId: msg.chat.id });

      // Auto-delete service "user left" message
      if (groupSettings?.autoDeleteServiceMessages) {
        try { await bot!.deleteMessage(msg.chat.id, msg.message_id); } catch {}
      }

      if (!groupSettings?.goodbyeMessage) return;
      const name = member.first_name || member.username || "Friend";
      const goodbye = groupSettings.goodbyeMessage
        .replace(/\{name\}/g, name)
        .replace(/\{group\}/g, msg.chat.title || "this group");
      await bot!.sendMessage(msg.chat.id, goodbye);
    } catch (err) {
      logger.error({ err }, "Error in left_chat_member handler");
    }
  });

  // ── Callback query handler (inline button presses) ────────────────────────
  bot.on("callback_query", async (query) => {
    try {
      await handleCallbackQuery(bot!, query);
    } catch (err) {
      logger.error({ err }, "Error in callback_query handler");
      try { await bot!.answerCallbackQuery(query.id); } catch {}
    }
  });

  // ── Inline query handler ───────────────────────────────────────────────────
  bot.on("inline_query", async (query) => {
    try {
      track("inline_query", query.from?.id).catch(() => {});
      await handleInlineQuery(bot!, query);
    } catch (err) {
      logger.error({ err }, "Error in inline_query handler");
    }
  });

  // ── Error handlers ─────────────────────────────────────────────────────────
  let pollingRestartAttempts = 0;
  const MAX_RESTART_ATTEMPTS = 10;

  bot.on("polling_error", async (err: any) => {
    logger.error({ code: err?.code, message: err?.message }, "Telegram polling error");
    await track("error", undefined, undefined, {
      type: "polling_error",
      code: err?.code,
      message: err?.message,
    });

    if (pollingRestartAttempts >= MAX_RESTART_ATTEMPTS) {
      logger.error("Max polling restart attempts reached — giving up");
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, pollingRestartAttempts), 5 * 60 * 1000);
    pollingRestartAttempts++;
    logger.warn({ attempt: pollingRestartAttempts, backoffMs }, "Scheduling polling restart");

    setTimeout(async () => {
      try {
        if (bot) {
          await bot.stopPolling();
          await new Promise((r) => setTimeout(r, 1000));
          await bot.startPolling();
          pollingRestartAttempts = 0;
          logger.info("Telegram polling restarted successfully");
        }
      } catch (restartErr) {
        logger.error({ restartErr }, "Failed to restart polling");
      }
    }, backoffMs);
  });

  bot.on("error", async (err) => {
    logger.error({ err }, "Telegram bot error");
    await track("error", undefined, undefined, { type: "bot_error", message: String(err) });
  });

  // ── Daily report scheduler ─────────────────────────────────────────────────
  scheduleDailyReport(bot);

  logger.info("Nova is listening for messages");
}

function scheduleDailyReport(botInstance: TelegramBot): void {
  const msUntilMidnight = (): number => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    setTimeout(async () => {
      await sendDailyReport(botInstance);
      scheduleNext();
    }, msUntilMidnight());
  };

  scheduleNext();
  logger.info({ nextReportMs: msUntilMidnight() }, "Daily report scheduled");
}

export function getBot(): TelegramBot | null {
  return bot;
}
