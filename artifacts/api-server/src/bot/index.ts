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

  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, "Failed to connect to MongoDB — bot cannot start without a database");
    return;
  }

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
      { command: "start", description: "Open Nova menu" },
      { command: "help", description: "Show all commands" },
      { command: "image", description: "Generate an image" },
      { command: "video", description: "Generate a short video" },
      { command: "music", description: "Generate music" },
      { command: "sticker", description: "Generate a sticker" },
      { command: "search", description: "Search the web" },
      { command: "ask", description: "Quick AI answer (no memory)" },
      { command: "translate", description: "Translate text" },
      { command: "build", description: "Build a website or app with AI" },
      { command: "deploy", description: "Build and deploy to Vercel" },
      { command: "remind", description: "Set a reminder" },
      { command: "reminders", description: "View your reminders" },
      { command: "poll", description: "Create a poll" },
      { command: "summarize", description: "Summarize conversation" },
      { command: "history", description: "View recent messages" },
      { command: "export", description: "Export conversation" },
      { command: "quote", description: "Get an inspiring quote" },
      { command: "fact", description: "Random mind-blowing fact" },
      { command: "tip", description: "Life or productivity tip" },
      { command: "mood", description: "Set your mood" },
      { command: "feedback", description: "Send feedback to the owner" },
      { command: "profile", description: "View your profile" },
      { command: "stats", description: "View your usage stats" },
      { command: "settings", description: "Your preferences" },
      { command: "voice", description: "Voice reply settings" },
      { command: "model", description: "Choose AI model" },
      { command: "premium", description: "Check premium status" },
      { command: "redeem", description: "Redeem a premium code" },
      { command: "forget", description: "Clear conversation memory" },
      { command: "cancel", description: "Cancel current action" },
    ], { scope: { type: "all_private_chats" } });

    await bot.setMyCommands([
      { command: "help", description: "Show group commands" },
      { command: "rules", description: "Show group rules" },
      { command: "report", description: "Report a message (reply to it)" },
      { command: "ban", description: "Ban a user (reply)" },
      { command: "unban", description: "Unban a user (reply)" },
      { command: "mute", description: "Mute a user [10m 2h 1d] (reply)" },
      { command: "unmute", description: "Unmute a user (reply)" },
      { command: "kick", description: "Kick a user (reply)" },
      { command: "warn", description: "Warn a user [reason] (reply)" },
      { command: "warnings", description: "Check warnings (reply)" },
      { command: "clearwarn", description: "Clear warnings (reply)" },
      { command: "note", description: "Add note to user (reply)" },
      { command: "notes", description: "View user notes (reply)" },
      { command: "clearnotes", description: "Clear user notes (reply)" },
      { command: "purge", description: "Delete last N messages" },
      { command: "pin", description: "Pin a message (reply)" },
      { command: "unpin", description: "Unpin latest pinned message" },
      { command: "delete", description: "Delete a message (reply)" },
      { command: "lock", description: "Lock group (admins only)" },
      { command: "unlock", description: "Unlock group" },
      { command: "slowmode", description: "Set slow mode [seconds]" },
      { command: "captcha", description: "Toggle captcha for new members" },
      { command: "autodelete", description: "Auto-delete service messages" },
      { command: "antilink", description: "Toggle anti-link protection" },
      { command: "antiflood", description: "Toggle anti-flood [limit]" },
      { command: "setlimit", description: "Set warn limit before auto-ban" },
      { command: "promote", description: "Promote user to admin (reply)" },
      { command: "demote", description: "Demote user from admin (reply)" },
      { command: "welcome", description: "Set welcome message" },
      { command: "setgoodbye", description: "Set goodbye message" },
      { command: "setrules", description: "Set group rules" },
      { command: "addword", description: "Add word to filter" },
      { command: "removeword", description: "Remove word from filter" },
      { command: "wordlist", description: "Show filtered words" },
      { command: "ai", description: "Toggle AI replies on/off" },
      { command: "style", description: "Set AI personality style" },
      { command: "poll", description: "Create a poll" },
      { command: "messageall", description: "DM all group members privately" },
      { command: "image", description: "Generate an image (mention bot)" },
      { command: "ask", description: "Quick AI answer (mention bot)" },
      { command: "translate", description: "Translate text (mention bot)" },
      { command: "video", description: "Generate a video (mention bot)" },
      { command: "music", description: "Generate music (mention bot)" },
      { command: "sticker", description: "Generate a sticker (mention bot)" },
      { command: "search", description: "Search the web (mention bot)" },
      { command: "unwarn", description: "Remove one warning from a user (reply)" },
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
        // Security: owner-only commands silently blocked in group chats — DM the bot to use them
        if (msg.text) {
          const grpCmd = msg.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
          if (OWNER_CMDS.has(grpCmd)) return;
        }

        // Captcha: muted users use inline keyboard buttons, not text
        // (text answers still supported as fallback but muted users can't type)
        if (msg.text) {
          const captchaKey = `${msg.chat.id}:${msg.from!.id}`;
          const challenge = captchaStore.get(captchaKey);
          if (challenge) {
            await bot!.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
            return; // Ignore text while pending — they use the button
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

        // Captcha verification — uses inline keyboard buttons so muted users can answer
        if (groupSettings?.captchaEnabled) {
          const captcha = generateCaptcha();
          const captchaKey = `${chatId}:${member.id}`;

          // Mute the new member immediately
          try {
            await bot!.restrictChatMember(chatId, member.id, {
              permissions: { can_send_messages: false, can_send_other_messages: false },
            });
          } catch {}

          // Generate 4 answer choices (correct + 3 distractors)
          const correctAnswer = captcha.answer;
          const wrongAnswers = new Set<number>();
          while (wrongAnswers.size < 3) {
            const offset = Math.floor(Math.random() * 10) - 5;
            const wrong = correctAnswer + offset;
            if (wrong !== correctAnswer && wrong > 0) wrongAnswers.add(wrong);
          }
          const choices = [...wrongAnswers, correctAnswer].sort(() => Math.random() - 0.5);

          const callbackPrefix = `captcha:${chatId}:${member.id}:`;
          const keyboard = {
            inline_keyboard: [
              choices.map(c => ({
                text: String(c),
                callback_data: `${callbackPrefix}${c}`,
              })),
            ],
          };

          // Try to send via DM first, fall back to group inline keyboard
          let sentViaDM = false;
          try {
            await bot!.sendMessage(member.id,
              `👋 Welcome to *${groupName}*!\n\n` +
              `To verify you're human, tap the correct answer below:\n\n` +
              `🔢 *What is: ${captcha.question} = ?*\n\nYou have 2 minutes.`,
              { parse_mode: "Markdown", reply_markup: keyboard }
            );
            sentViaDM = true;
            await bot!.sendMessage(chatId,
              `👋 Welcome, ${name}! I sent you a DM with a verification challenge. Please check your messages.`
            );
          } catch {
            // User hasn't started the bot — show inline keyboard in group (muted users can still tap buttons)
          }

          let challengeMsg: { message_id: number } = { message_id: 0 };
          if (!sentViaDM) {
            challengeMsg = await bot!.sendMessage(chatId,
              `👋 Welcome, ${name}!\n\n` +
              `Tap the correct answer to verify you're human:\n\n` +
              `🔢 *What is: ${captcha.question} = ?*`,
              { parse_mode: "Markdown", reply_markup: keyboard }
            );
          }

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
                if (remaining.messageId) await bot!.deleteMessage(chatId, remaining.messageId);
                await bot!.banChatMember(chatId, member.id);
                await bot!.unbanChatMember(chatId, member.id);
                await bot!.sendMessage(chatId, `⏰ ${name} was removed for not completing the verification.`);
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
      // Send goodbye privately so the group chat stays clean
      try {
        await bot!.sendMessage(member.id, goodbye);
      } catch {
        // User may have blocked the bot or never started it — silently skip
      }
    } catch (err) {
      logger.error({ err }, "Error in left_chat_member handler");
    }
  });

  // ── Callback query handler (inline button presses) ────────────────────────
  bot.on("callback_query", async (query) => {
    try {
      // Handle captcha answer buttons before delegating
      if (query.data?.startsWith("captcha:") && query.message) {
        const parts = query.data.split(":");
        // Format: captcha:CHATID:USERID:ANSWER
        if (parts.length === 4) {
          const [, chatIdStr, userIdStr, answerStr] = parts;
          const chatId = parseInt(chatIdStr);
          const userId = parseInt(userIdStr);
          const answer = parseInt(answerStr);

          // Only the correct user can answer
          if (query.from.id !== userId) {
            await bot!.answerCallbackQuery(query.id, { text: "This verification is not for you.", show_alert: true });
            return;
          }

          const captchaKey = `${chatId}:${userId}`;
          const challenge = captchaStore.get(captchaKey);

          if (!challenge) {
            await bot!.answerCallbackQuery(query.id, { text: "Verification already completed or expired." });
            return;
          }

          if (Date.now() > challenge.expiresAt) {
            captchaStore.delete(captchaKey);
            await bot!.answerCallbackQuery(query.id, { text: "Verification expired. You have been removed." });
            try {
              await bot!.banChatMember(chatId, userId);
              await bot!.unbanChatMember(chatId, userId);
            } catch {}
            return;
          }

          if (answer === challenge.answer) {
            captchaStore.delete(captchaKey);
            await bot!.answerCallbackQuery(query.id, { text: "✅ Verified! Welcome to the group." });
            try {
              // Restore permissions
              await bot!.restrictChatMember(chatId, userId, {
                permissions: {
                  can_send_messages: true,
                  can_send_other_messages: true,
                  can_add_web_page_previews: true,
                  can_send_polls: true,
                },
              });
              // Delete challenge message
              if (challenge.messageId) {
                await bot!.deleteMessage(chatId, challenge.messageId).catch(() => {});
              }
              // Delete DM challenge if sent via DM
              if (query.message?.chat.type === "private") {
                await bot!.deleteMessage(query.message.chat.id, query.message.message_id).catch(() => {});
              }
              // Send welcome message
              const name = query.from.first_name || query.from.username || "User";
              const groupSettings2 = await GroupSettings.findOne({ chatId });
              const welcomeText = groupSettings2?.welcomeMessage
                ? groupSettings2.welcomeMessage.replace(/\{name\}/g, name).replace(/\{group\}/g, "the group")
                : `✅ Welcome, ${name}! You've been verified.`;
              await bot!.sendMessage(chatId, welcomeText);
            } catch {}
          } else {
            await bot!.answerCallbackQuery(query.id, { text: "❌ Wrong answer. Try again.", show_alert: true });
          }
          return;
        }
      }

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
      const ownerId = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID, 10) : null;
      if (ownerId && bot) {
        bot.sendMessage(ownerId,
          "⚠️ Nova polling has crashed and could not auto-recover after " +
          MAX_RESTART_ATTEMPTS + " attempts. Please restart the server."
        ).catch(() => {});
      }
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
