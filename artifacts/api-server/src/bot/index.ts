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
import { disconnectDB } from "./services/db.js";
import { logger } from "../lib/logger.js";

// ── In-memory captcha store ─────────────────────────────────────────────────
interface CaptchaChallenge {
  answer: number;
  question: string;
  choices: number[];      // the 4 shuffled answer options
  chatId: number;         // group chat ID
  messageId: number;      // group "Verify" message ID
  dmChatId?: number;      // private chat ID where the question was sent
  dmMessageId?: number;   // private chat message ID for the question
  expiresAt: number;
  attempts: number;       // wrong answer count — max 3 before removal
}
const captchaStore = new Map<string, CaptchaChallenge>(); // key: `chatId:userId`

// Evict expired captchas every 10 minutes (safety net if per-item timer misfires)
setInterval(() => {
  const now = Date.now();
  for (const [key, ch] of captchaStore.entries()) {
    if (now > ch.expiresAt) captchaStore.delete(key);
  }
}, 10 * 60 * 1000);

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
  // Previously missing from gate (commands existed but were unreachable):
  "/analytics", "/dm", "/messageuser", "/botinfo",
  // New commands:
  "/searchuser", "/listscheduled", "/cancelschedule",
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
      { command: "voice", description: "Convert text to speech audio" },
      { command: "listen", description: "Transcribe a voice message to text" },
      { command: "describe", description: "Describe or analyze a photo" },
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
      { command: "voice", description: "Convert text to speech (mention bot)" },
      { command: "describe", description: "Describe a photo (reply with mention)" },
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

        // Captcha verification — triggered when member clicks "Verify I'm human" in the group
        if (msg.text.startsWith("/start captcha_")) {
          const payload = msg.text.slice("/start captcha_".length);
          const parts = payload.split("_");
          if (parts.length === 2) {
            const groupChatId = parseInt(parts[0], 10);
            const targetUserId = parseInt(parts[1], 10);
            if (msg.from!.id !== targetUserId) {
              await bot!.sendMessage(msg.chat.id, "This verification link is not for you.");
              return;
            }
            const captchaKey = `${groupChatId}:${targetUserId}`;
            const challenge = captchaStore.get(captchaKey);
            if (!challenge || Date.now() > challenge.expiresAt) {
              captchaStore.delete(captchaKey);
              await bot!.sendMessage(msg.chat.id, "This verification has expired. Please leave and rejoin the group to get a new one.");
              return;
            }
            if (challenge.dmMessageId) {
              await bot!.sendMessage(msg.chat.id, "Your verification question is already above. Please answer it.");
              return;
            }
            // Send the math question with answer choices in DM
            const callbackPrefix = `captcha:${groupChatId}:${targetUserId}:`;
            const keyboard = {
              inline_keyboard: [
                challenge.choices.map(c => ({ text: String(c), callback_data: `${callbackPrefix}${c}` })),
              ],
            };
            const dmMsg = await bot!.sendMessage(msg.chat.id,
              `Verification Challenge\n\nSolve this to join the group:\n\n${challenge.question} = ?\n\nTap the correct answer. You have 3 attempts.`,
              { reply_markup: keyboard }
            );
            challenge.dmChatId = msg.chat.id;
            challenge.dmMessageId = dmMsg.message_id;
            return;
          }
        }

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

        // Captcha verification — member clicks a button that opens a DM to solve a math question
        if (groupSettings?.captchaEnabled) {
          const captcha = generateCaptcha();
          const captchaKey = `${chatId}:${member.id}`;

          // Mute immediately — muted users can still tap URL buttons
          try {
            await bot!.restrictChatMember(chatId, member.id, {
              permissions: { can_send_messages: false, can_send_other_messages: false },
            });
          } catch {}

          // Pre-generate shuffled choices so they stay consistent if the user re-opens the DM
          const correctAnswer = captcha.answer;
          const wrongAnswers = new Set<number>();
          while (wrongAnswers.size < 3) {
            const offset = Math.floor(Math.random() * 10) - 5;
            const wrong = correctAnswer + offset;
            if (wrong !== correctAnswer && wrong > 0) wrongAnswers.add(wrong);
          }
          const choices = [...wrongAnswers, correctAnswer].sort(() => Math.random() - 0.5);

          captchaStore.set(captchaKey, {
            answer: captcha.answer,
            question: captcha.question,
            choices,
            chatId,
            messageId: 0,
            expiresAt: Date.now() + 5 * 60 * 1000,
            attempts: 0,
          });

          // Group message: URL button opens DM with the bot (works even for muted users)
          const verifyUrl = `https://t.me/${botUsername}?start=captcha_${chatId}_${member.id}`;
          try {
            const challengeMsg = await bot!.sendMessage(chatId,
              `👋 Welcome, ${name}!\n\n` +
              `To send messages here you need to verify you are human.\n\n` +
              `Tap the button below — it opens a private chat where you answer one quick math question.\n\n` +
              `⏳ You have 5 minutes and 3 attempts.`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "✅ Verify I'm human", url: verifyUrl }]],
                },
              }
            );
            const entry = captchaStore.get(captchaKey);
            if (entry) entry.messageId = challengeMsg.message_id;
          } catch {}

          // Auto-remove after 5 minutes if they never verify
          setTimeout(async () => {
            const pending = captchaStore.get(captchaKey);
            if (pending) {
              captchaStore.delete(captchaKey);
              try {
                if (pending.messageId) await bot!.deleteMessage(chatId, pending.messageId).catch(() => {});
                await bot!.banChatMember(chatId, member.id);
                await bot!.unbanChatMember(chatId, member.id);
                await bot!.sendMessage(chatId, `⏰ ${name} was removed for not completing verification in time.`);
              } catch {}
            }
          }, 5 * 60 * 1000);
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
            // ── Correct answer ───────────────────────────────────────────────
            captchaStore.delete(captchaKey);
            await bot!.answerCallbackQuery(query.id, { text: "✅ Correct! You are now verified." });
            // Restore full permissions in the group
            try {
              await bot!.restrictChatMember(chatId, userId, {
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
            } catch (unmuteErr) {
              logger.error({ err: unmuteErr, chatId, userId }, "Captcha: failed to restore member permissions after verification");
            }
            // Clean up the group "Verify" message
            if (challenge.messageId) {
              await bot!.deleteMessage(chatId, challenge.messageId).catch(() => {});
            }
            // Update DM to show success
            if (challenge.dmChatId && challenge.dmMessageId) {
              await bot!.editMessageText(
                "✅ Verified! You can now send messages in the group.",
                { chat_id: challenge.dmChatId, message_id: challenge.dmMessageId }
              ).catch(() => {});
            }
            // Post welcome message in the group
            try {
              const name = query.from.first_name || query.from.username || "User";
              const groupSettings2 = await GroupSettings.findOne({ chatId });
              const welcomeText = groupSettings2?.welcomeMessage
                ? groupSettings2.welcomeMessage.replace(/\{name\}/g, name).replace(/\{group\}/g, "the group")
                : `✅ Welcome, ${name}! You have been verified.`;
              await bot!.sendMessage(chatId, welcomeText);
            } catch {}
          } else {
            // ── Wrong answer ─────────────────────────────────────────────────
            challenge.attempts += 1;
            const remaining = 3 - challenge.attempts;

            if (remaining <= 0) {
              // 3 wrong answers — remove from group
              captchaStore.delete(captchaKey);
              await bot!.answerCallbackQuery(query.id, {
                text: "❌ Too many wrong answers. You have been removed from the group.",
                show_alert: true,
              });
              try {
                if (challenge.messageId) await bot!.deleteMessage(chatId, challenge.messageId).catch(() => {});
                await bot!.banChatMember(chatId, userId);
                await bot!.unbanChatMember(chatId, userId);
                const name = query.from.first_name || query.from.username || "User";
                await bot!.sendMessage(chatId, `${name} failed verification (3 wrong answers) and was removed.`);
                // Update DM to explain removal
                if (challenge.dmChatId && challenge.dmMessageId) {
                  await bot!.editMessageText(
                    "❌ You used all 3 attempts and have been removed from the group.\n\nYou may rejoin and try again.",
                    { chat_id: challenge.dmChatId, message_id: challenge.dmMessageId }
                  ).catch(() => {});
                }
              } catch {}
            } else {
              // Still has attempts left — show popup and update DM message
              await bot!.answerCallbackQuery(query.id, {
                text: `❌ Wrong answer. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
                show_alert: true,
              });
              if (challenge.dmChatId && challenge.dmMessageId) {
                const callbackPrefix = `captcha:${chatId}:${userId}:`;
                await bot!.editMessageText(
                  `Verification Challenge\n\nSolve this to join the group:\n\n${challenge.question} = ?\n\n` +
                  `❌ Wrong answer. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
                  {
                    chat_id: challenge.dmChatId,
                    message_id: challenge.dmMessageId,
                    reply_markup: {
                      inline_keyboard: [
                        challenge.choices.map(c => ({ text: String(c), callback_data: `${callbackPrefix}${c}` })),
                      ],
                    },
                  }
                ).catch(() => {});
              }
            }
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

  // ── Graceful shutdown on SIGTERM / SIGINT ─────────────────────────────────
  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, "Graceful shutdown initiated");
    try {
      if (bot) await bot.stopPolling();
    } catch (err) {
      logger.warn({ err }, "Error stopping polling during shutdown");
    }
    await disconnectDB();
    process.exit(0);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

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
