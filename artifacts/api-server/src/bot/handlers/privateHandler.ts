import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { chat, clearMemory } from "../services/ai.js";
import { generateImage, getImageLimit, editImage, downloadTelegramPhoto } from "../services/image.js";
import { analyzeImage } from "../services/imageAnalysis.js";
import { isRateLimited } from "../utils/rateLimiter.js";
import { formatDate, addDays, getUserName, safeSend, startTypingLoop, startLiveStatus } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { Memory } from "../models/Memory.js";
import { getPending, clearPending, setPending, PHOTO_ACTIONS, OWNER_PENDING_ACTIONS } from "../utils/pendingActions.js";
import { handleOwnerPendingText } from "./ownerHandler.js";
import { getMaintenance, setMaintenance } from "../utils/maintenanceState.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import {
  mainMenuKeyboard,
  funMenuKeyboard,
  aiMenuKeyboard,
  imageMenuKeyboard,
  settingsMenuKeyboard,
  moodPickerKeyboard,
  backToMainKeyboard,
  backToSettingsKeyboard,
  repeatKeyboard,
  buildResultKeyboard,
  insufficientCreditsKeyboard,
  creditsMenuKeyboard,
  onboardingWelcomeKeyboard,
  onboardingDoneKeyboard,
  welcomeBackKeyboard,
  achievementsKeyboard,
  privacyKeyboard,
  privacyMenuKeyboard,
  updatesKeyboard,
  buildMenuKeyboard,
  whatsNewKeyboard,
  mainMenuWithNewsKeyboard,
} from "../utils/keyboards.js";
import { hasAnyPaymentProvider } from "../services/payment.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import {
  updateRecentFeatures,
  checkAndGrantAchievements,
  checkAndAwardAchievements,
  updateLoginStreak,
  formatAchievementsText,
  formatAchievementToast,
  formatAchievementNotification,
  recordLastFeature,
  getLastFeatures,
  getUserAchievements,
  FEATURE_LABELS,
  ACHIEVEMENTS,
} from "../services/engagement.js";
import { contextSuggestionsKeyboard } from "../utils/suggestions.js";
import { trackFeature } from "../services/analytics.js";
import { webSearch, formatSearchResults } from "../services/webSearch.js";
import { generateTTS } from "../services/tts.js";
import { transcribeAudio } from "../services/stt.js";
import { generateProject, typeLabel } from "../services/projectGenerator.js";
import {
  createGitHubRepo,
  pushAllFiles,
  repoExists,
  sanitizeRepoName,
  uniqueRepoName,
} from "../services/github.js";
import { cacheUserBuild, getCachedBuild } from "../utils/buildCache.js";
import { addCredits, deductCredits, getCreditCost } from "../services/credits.js";
import { deployToVercel, deployToRender, autoFixProjectFiles } from "../services/deploy.js";
import { downloadTelegramDocument, extractTextFromDocument } from "../services/document.js";
import { createReminder, listUserReminders, cancelReminder } from "../services/reminder.js";
import { parseDurationToMs } from "../models/Reminder.js";
import { isPremiumEmojiEnabled, applyPremiumEmojiSafe } from "../utils/premiumEmoji.js";
import { track } from "../services/analytics.js";
import { logger } from "../../lib/logger.js";
import { getSuggestionsKeyboard, getSuggestionLine } from "../services/suggestions.js";
import { formatAnnouncements, getNewCount } from "../services/announcements.js";
import { getFailedGroups, sendGroupGateMessage } from "../services/groupGate.js";
import { detectImageIntent, detectStickerIntent, detectSearchIntent, detectBuildIntent, detectSummarizeIntent, detectTranslateIntent } from "../services/intentEngine.js";

// ── Per-user build/deploy cooldown (3 min) ────────────────────────────────────
const BUILD_COOLDOWN_MS = 3 * 60 * 1000;
const buildCooldownMap = new Map<number, number>();

function checkBuildCooldown(userId: number): number {
  const last = buildCooldownMap.get(userId) ?? 0;
  return Math.max(0, BUILD_COOLDOWN_MS - (Date.now() - last));
}

function setBuildCooldown(userId: number): void {
  buildCooldownMap.set(userId, Date.now());
}

function clearBuildCooldown(userId: number): void {
  buildCooldownMap.delete(userId);
}

// Evict stale cooldown entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - BUILD_COOLDOWN_MS;
  for (const [uid, ts] of buildCooldownMap.entries()) {
    if (ts < cutoff) buildCooldownMap.delete(uid);
  }
}, 10 * 60 * 1000);

// ── Resolve GitHub credentials: user's stored > env vars ─────────────────────

async function resolveGitHubCreds(
  user: IUser
): Promise<{ token: string; username: string } | null> {
  const username = user.github?.username || process.env.GITHUB_USERNAME;
  let token = process.env.GITHUB_TOKEN;

  try {
    const fresh = await User.findOne({ userId: user.userId }).select("+github.tokenEncrypted");
    const enc = (fresh as any)?.github?.tokenEncrypted as string | undefined;
    if (enc) {
      const dec = decrypt(enc);
      if (dec) token = dec;
    }
  } catch {}

  if (token && username) return { token, username };
  return null;
}

async function resolveVercelToken(user: IUser): Promise<string | null> {
  try {
    const fresh = await User.findOne({ userId: user.userId }).select("+vercelTokenEncrypted");
    const enc = (fresh as any)?.vercelTokenEncrypted as string | undefined;
    if (enc) {
      const dec = decrypt(enc);
      if (dec) return dec;
    }
  } catch {}
  return process.env.VERCEL_TOKEN ?? null;
}

async function resolveRenderToken(user: IUser): Promise<string | null> {
  try {
    const fresh = await User.findOne({ userId: user.userId }).select("+renderTokenEncrypted");
    const enc = (fresh as any)?.renderTokenEncrypted as string | undefined;
    if (enc) {
      const dec = decrypt(enc);
      if (dec) return dec;
    }
  } catch {}
  return process.env.RENDER_API_KEY ?? null;
}

async function sendAIReply(
  bot: TelegramBot,
  chatId: number,
  text: string,
  extra: TelegramBot.SendMessageOptions = {}
): Promise<void> {
  if (isPremiumEmojiEnabled()) {
    try {
      const htmlText = applyPremiumEmojiSafe(text);
      await bot.sendMessage(chatId, htmlText, { parse_mode: "HTML", ...extra });
      return;
    } catch {
      // HTML parse failed — fall through to safeSend
    }
  }
  await safeSend(bot, chatId, text, extra);
}


export async function handleVoiceMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser
): Promise<void> {
  const chatId = msg.chat.id;
  if (user.banned) return;

  const config = await getOrCreateBotConfig();
  if (!config.features?.sttEnabled) {
    await bot.sendMessage(chatId, "Voice transcription is temporarily unavailable. Please type your message instead.");
    return;
  }

  const voice = msg.voice;
  if (!voice) {
    await bot.sendMessage(chatId, "Please send a voice message to transcribe.");
    return;
  }

  const status = await startLiveStatus(bot, chatId, "🎤 Transcribing your voice message");
  try {
    const file = await bot.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Failed to download voice file");
    const buffer = Buffer.from(await response.arrayBuffer());
    const transcript = await transcribeAudio(buffer);
    status.stop();
    await status.delete();
    if (!transcript) {
      await bot.sendMessage(chatId, "Could not transcribe your voice message. Please try again or type your message.");
      return;
    }
    await bot.sendMessage(chatId, `🎤 Transcript:\n\n${transcript}`,
      { reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
  } catch (err) {
    status.stop();
    await status.delete();
    logger.error({ err }, "Voice transcription error");
    await bot.sendMessage(chatId, "Voice transcription failed. Please type your message instead.");
  }
}

export async function handlePrivateMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  maintenanceMode: boolean
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (user.banned) {
    if (text.startsWith("/appeal")) {
      const appealMsg = text.replace(/^\/appeal\s*/i, "").trim();
      if (!appealMsg) {
        await bot.sendMessage(chatId, "You are banned from Nova.\n\nTo appeal, use:\n/appeal <your reason>\n\nExample: /appeal I was banned by mistake, please review.");
        return;
      }
      const ownerId = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;
      const userName = user.username ? `@${user.username}` : user.firstName || String(user.userId);
      if (ownerId) {
        try {
          await bot.sendMessage(ownerId,
            `📨 Ban Appeal\n\nUser: ${userName} (ID: ${user.userId})\n\nMessage:\n${appealMsg}\n\nReply /unban ${user.userId} to lift the ban.`
          );
          try {
            const { Feedback } = await import("../models/Feedback.js");
            await new Feedback({ userId: user.userId, username: user.username, firstName: user.firstName, message: appealMsg, type: "appeal" }).save();
          } catch {}
          await bot.sendMessage(chatId, "Your appeal has been sent to the owner. Please wait for a review.");
        } catch {
          await bot.sendMessage(chatId, "Could not send your appeal. Please try again later.");
        }
      } else {
        await bot.sendMessage(chatId, "Appeals are not configured at this time.");
      }
      return;
    }
    await bot.sendMessage(chatId, "You have been banned from using Nova.\n\nTo appeal, send: /appeal <your reason>");
    return;
  }

  if (isRateLimited(user.userId)) {
    await bot.sendMessage(chatId,
      user.settings.emoji
        ? "You are sending messages too fast. Please wait a minute."
        : "Slow down! Too many messages. Wait a minute."
    );
    return;
  }

  if (maintenanceMode) {
    await bot.sendMessage(chatId, "Nova is currently under maintenance. Check back soon!");
    return;
  }

  const e = user.settings.emoji;
  const name = getUserName(msg);

  // ── Check pending action (owner or user flows) ────────────────────────────
  const pendingAction = getPending(user.userId);
  if (pendingAction && !PHOTO_ACTIONS.has(pendingAction.type) && !text.startsWith("/")) {
    clearPending(user.userId);
    if (OWNER_PENDING_ACTIONS.has(pendingAction.type) && user.isOwner) {
      await handleOwnerPendingText(
        bot, chatId, user.userId, pendingAction.type, text,
        getMaintenance, setMaintenance, pendingAction.data
      );
      return;
    }
    await handlePendingText(bot, chatId, user, pendingAction.type, text, e, pendingAction.data, msg.message_id);
    return;
  }

  // /start — onboarding for new users, welcome back for returning users
  if (text === "/start" || text.startsWith("/start ")) {
    // ── Referral handling ───────────────────────────────────────────────────
    if (text.startsWith("/start ")) {
      const param = text.slice(7).trim();
      if (param.startsWith("ref_") && !user.referredBy) {
        const referrerId = parseInt(param.replace("ref_", ""));
        if (!isNaN(referrerId) && referrerId !== user.userId) {
          user.referredBy = referrerId;
          const now = new Date();
          const premiumExpiry = user.premium.expiresAt && user.premium.expiresAt > now ? user.premium.expiresAt : now;
          user.premium.active = true;
          user.premium.expiresAt = addDays(premiumExpiry, 3);
          user.premium.plan = user.premium.plan || "referral";
          await user.save();
          const cfg = await getOrCreateBotConfig();
          const newUserBonus = cfg.creditRewards?.newUser ?? 20;
          await addCredits(user.userId, newUserBonus);
          try {
            const referrer = await User.findOne({ userId: referrerId });
            if (referrer && !referrer.isOwner) {
              const refExpiry = referrer.premium.expiresAt && referrer.premium.expiresAt > now ? referrer.premium.expiresAt : now;
              referrer.premium.active = true;
              referrer.premium.expiresAt = addDays(refExpiry, 7);
              referrer.premium.plan = referrer.premium.plan || "referral";
              referrer.referrals = referrer.referrals || [];
              if (!referrer.referrals.includes(user.userId)) referrer.referrals.push(user.userId);
              await referrer.save();
              const referrerBonus = cfg.creditRewards?.referrer ?? 50;
              await addCredits(referrerId, referrerBonus);
              await bot.sendMessage(referrerId,
                `🎉 Someone joined Nova using your referral link!\n\n+7 days Premium & +${referrerBonus} credits added!`
              ).catch(() => {});
            }
          } catch {}
          await bot.sendMessage(chatId,
            `🎉 *Referral Bonus Activated!*\n\n` +
            `• ✨ 3 days of Premium\n• 💰 +${(await getOrCreateBotConfig()).creditRewards?.newUser ?? 20} bonus credits\n\nWelcome to Nova!`,
            { parse_mode: "Markdown" }
          );
        }
      }
    }

    // Ensure referral code exists
    if (!user.referralCode) {
      user.referralCode = `NOVA${user.userId.toString(36).toUpperCase()}`;
      await user.save();
    }

    // Update login streak
    const streak = await updateLoginStreak(user.userId);

    const isNew = !user.onboardingComplete && Date.now() - user.firstSeen.getTime() < 60000;

    if (isNew) {
      checkAndAwardAchievements(user.userId, { type: "message", count: 1 }).catch(() => {});
      track("new_user", user.userId, chatId).catch(() => {});
      await bot.sendMessage(chatId,
        `👋 *Welcome to Nova, ${name}!*\n\n` +
        `I'm your AI assistant — more than a chatbot.\n\n` +
        `💬 *Chat* — Ask me anything, get smart answers\n` +
        `🎨 *Images* — Generate art from text, edit photos\n` +
        `🔊 *Voice* — Convert any text to speech audio\n` +
        `🔍 *Search* — Real-time web search with AI summaries\n` +
        `🌐 *Build* — Create full websites & apps with AI\n` +
        `📝 *Translate, Summarize, Analyze* — All in one place\n\n` +
        `💡 You don't need commands — just type naturally!\n` +
        `_"draw me a sunset"_ → generates it\n` +
        `_"build a portfolio site"_ → builds it\n\n` +
        `Take a quick tour to personalise your experience, or jump straight in 👇`,
        { parse_mode: "Markdown", reply_markup: onboardingWelcomeKeyboard() }
      );
    } else {
      const recentFeatures = await getLastFeatures(user.userId);
      const hasNews = getNewCount() > 0;
      const streakLine = streak > 1 ? `\n🔥 ${streak}-day streak — keep it going!` : "";
      const premiumBadge = user.premium.active ? " ✨" : "";
      let greeting = `👋 *Welcome back, ${name}${premiumBadge}!*${streakLine}`;

      if (recentFeatures.length > 0) {
        const recents = recentFeatures
          .map(f => FEATURE_LABELS[f])
          .filter(Boolean)
          .slice(0, 3);
        if (recents.length > 0) {
          greeting += `\n\n⚡ *Quick access to your recent tools:*`;
          const recentKeyboard: TelegramBot.InlineKeyboardMarkup = {
            inline_keyboard: [
              recents.map(f => ({ text: `${f.icon} ${f.label}`, callback_data: f.callback })),
              [{ text: "🏠 Open Menu", callback_data: "main_menu" }, { text: hasNews ? "🆕 What's New!" : "🔔 What's New", callback_data: "whats_new_menu" }],
            ],
          };
          await bot.sendMessage(chatId, greeting, { parse_mode: "Markdown", reply_markup: recentKeyboard });
          return;
        }
      }
      greeting += `\n\nWhat would you like to do today?`;
      await bot.sendMessage(chatId, greeting, {
        parse_mode: "Markdown",
        reply_markup: mainMenuWithNewsKeyboard(hasNews),
      });
    }
    return;
  }

  // /privacy — privacy & data transparency
  if (text === "/privacy") {
    track("privacy_view", user.userId, chatId).catch(() => {});
    await bot.sendMessage(chatId,
      `🔒 Privacy & Data\n\n` +
      `Nova stores the following data about you:\n\n` +
      `💬 Chat Memory — Your recent conversations so I can give contextual replies. Deleted when you clear memory.\n\n` +
      `👤 Profile — Your Telegram name, username, and ID. Required to identify your account.\n\n` +
      `⚙️ Preferences — Your style, language, mood, and settings. Stored to personalize responses.\n\n` +
      `📊 Usage Stats — Message counts and feature usage. Used to enforce daily limits and track streaks.\n\n` +
      `🔑 Tokens (if added) — GitHub, Vercel, and Render tokens are encrypted with AES-256. Not readable by anyone.\n\n` +
      `📈 Analytics — Anonymous feature usage events. Used to improve the bot. Not shared with third parties.\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Your data is never sold or shared. You can delete it at any time using the options below.`,
      { reply_markup: privacyMenuKeyboard() }
    );
    return;
  }

  // /achievements — view earned badges
  if (text === "/achievements") {
    const earned = await getUserAchievements(user.userId);
    const earnedIds = earned.map(a => a.id);
    const totalAvailable = ACHIEVEMENTS.filter(a => !a.secret).length;
    let msg = `🏅 Your Achievements (${earned.length}/${totalAvailable})\n\n`;
    if (earned.length === 0) {
      msg += `You haven't earned any achievements yet!\n\n`;
      msg += `How to earn them:\n• Chat, generate images, build projects\n• Maintain daily streaks\n• Refer friends\n• Claim your daily reward`;
    } else {
      for (const a of earned) {
        msg += `${a.icon} ${a.title} — ${a.description}\n`;
      }
      const locked = ACHIEVEMENTS.filter(a => !a.secret && !earnedIds.includes(a.id));
      if (locked.length > 0) {
        msg += `\n🔒 Still to unlock (${locked.length}):\n`;
        for (const a of locked.slice(0, 5)) {
          msg += `• ${a.title} — ${a.description}\n`;
        }
        if (locked.length > 5) msg += `...and ${locked.length - 5} more!`;
      }
    }
    await bot.sendMessage(chatId, msg, { reply_markup: achievementsKeyboard() });
    return;
  }

  // /whats_new — updates & announcements
  if (text === "/whats_new" || text === "/whatsnew") {
    track("whats_new_view", user.userId, chatId).catch(() => {});
    await bot.sendMessage(chatId, formatAnnouncements(), { reply_markup: whatsNewKeyboard() });
    return;
  }

  // /help
  if (text === "/help") {
    const badge = user.premium.active ? " ✨ Premium" : "";
    await bot.sendMessage(chatId,
      `Hey ${name}${badge}! Here's everything I can do:\n\n` +
      `💬 Just type anything to chat with me!\n\n` +
      `── Create ──\n` +
      `🎨 /image <prompt> — Generate an image\n` +
      `🖼️ /sticker <prompt> — Generate a sticker\n` +
      `🔍 /describe — Analyze or describe a photo\n` +
      `🔨 /build <idea> — Build a website or app with AI\n` +
      `🚀 /deploy <idea> — Build + deploy to Vercel\n\n` +
      `── Explore ──\n` +
      `🔍 /search <query> — Search the web\n` +
      `❓ /ask <question> — Quick answer (no memory)\n` +
      `🌍 /translate <text> — Translate text\n` +
      `📝 /summarize — Summarize conversation\n` +
      `📜 /history — View recent messages\n\n` +
      `── Tools ──\n` +
      `⏰ /remind <time> <msg> — Set a reminder\n` +
      `📋 /reminders — View your reminders\n` +
      `📊 /poll <q> | <opt1> | <opt2> — Create a poll\n` +
      `📤 /export — Export conversation\n\n` +
      `── Fun ──\n` +
      `💬 /quote — Inspiring quote\n` +
      `🎲 /fact — Random mind-blowing fact\n` +
      `💡 /tip — Life or productivity tip\n` +
      `😶 /mood <mood> — Set your mood\n\n` +
      `── Account ──\n` +
      `👤 /profile — Your profile\n` +
      `📊 /stats — Your usage stats\n` +
      `⚙️ /settings — Your preferences\n` +
      `🎁 /daily — Claim daily reward\n` +
      `👥 /refer — Refer a friend & earn Premium\n` +
      `💎 /premium — Check premium status\n` +
      `🎁 /redeem — Redeem a code\n` +
      `🧹 /forget — Clear memory\n` +
      `❌ /cancel — Cancel current action\n` +
      `📢 /feedback <msg> — Send feedback\n\n` +
      `📄 Send any PDF/TXT/DOCX — I'll read and analyze it!\n` +
      `🖼️ Send a photo — I'll describe or edit it!\n\n` +
      `Or tap a button below to explore everything 👇`,
      { reply_markup: mainMenuKeyboard() }
    );
    return;
  }

  // /profile
  if (text === "/profile") {
    const premiumLine = user.premium.active
      ? `✨ Premium — expires ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}`
      : "Free";
    const builds = user.usage.builds ?? 0;
    const daysSinceJoin = Math.floor((Date.now() - user.firstSeen.getTime()) / 86400000);
    await bot.sendMessage(chatId,
      `👤 Your Profile\n\n` +
      `Name: ${name}\n` +
      `ID: ${user.userId}\n` +
      `Username: ${user.username ? "@" + user.username : "N/A"}\n` +
      `Status: ${premiumLine}\n` +
      `Member for: ${daysSinceJoin} day${daysSinceJoin !== 1 ? "s" : ""}\n\n` +
      `── Settings ──\n` +
      `Style: ${user.settings.style}\n` +
      `Language: ${user.settings.language || "en"}\n` +
      `Mood: ${user.mood || "Not set"}\n` +
      `Emojis: ${user.settings.emoji ? "On" : "Off"}\n` +
      `Reply length: ${user.settings.length}\n\n` +
      `── Usage ──\n` +
      `Messages today: ${user.usage.messages}\n` +
      `Images today: ${user.usage.images}/${await getImageLimit(user.premium.active)}\n` +
      `Total builds: ${builds}\n` +
      `Groups: ${user.groups.length}\n` +
      `Warnings: ${user.warnings}`,
      { reply_markup: { inline_keyboard: [[{ text: "⚙️ Settings", callback_data: "settings_menu" }, { text: "📊 Stats", callback_data: "show_stats" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /model — owner-only (regular users see info message)
  if (text === "/model" || text === "/models") {
    await bot.sendMessage(chatId,
      `🤖 AI Model\n\nThe AI model is selected automatically based on your account type.\n\nPremium users get access to higher-quality models automatically.`,
      { reply_markup: { inline_keyboard: [[{ text: "💎 Get Premium", callback_data: "settings_premium" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /settings
  if (text === "/settings") {
    await bot.sendMessage(chatId,
      `⚙️ Settings\n\n` +
      `Style: ${user.settings.style}\n` +
      `Language: ${user.settings.language || "en"}\n` +
      `Emojis: ${user.settings.emoji ? "On" : "Off"}\n` +
      `Reply length: ${user.settings.length}\n` +
      `Mood: ${user.mood || "Not set"}\n\n` +
      `Use the buttons below to change anything:`,
      { reply_markup: settingsMenuKeyboard(user) }
    );
    return;
  }

  // /premium
  if (text === "/premium") {
    const backKb = { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] };
    const premLimCfg = await getOrCreateBotConfig();
    const premImgLimitDisplay = premLimCfg.usageLimits.premiumImages < 0 ? "Unlimited" : String(premLimCfg.usageLimits.premiumImages);
    const freeImgLimitDisplay = String(premLimCfg.usageLimits.freeImages);
    if (user.premium.active) {
      await bot.sendMessage(chatId,
        `✨ You are a Premium member!\n\n` +
        `Expires: ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}\n\n` +
        `Perks:\n` +
        `• ${premImgLimitDisplay} images per day\n` +
        `• Longer AI context\n` +
        `• Richer responses`,
        { reply_markup: backKb }
      );
    } else {
      await bot.sendMessage(chatId,
        `You are on the Free plan.\n\n` +
        `Free limits:\n` +
        `• ${freeImgLimitDisplay} images per day\n` +
        `• 5 photo edits per day\n` +
        `• Standard AI responses\n\n` +
        `Upgrade to VIP:\n` +
        `• 💳 Buy with Telegram Stars — tap 💰 Credits\n` +
        `• 🎟️ Redeem a code — /redeem CODE`,
        { reply_markup: { inline_keyboard: [[{ text: "⭐ Buy VIP with Stars", callback_data: "credits_menu" }], [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
      );
    }
    return;
  }

  // /daily — claim daily credit reward
  if (text === "/daily") {
    const dailyCfg = await getOrCreateBotConfig();
    const dailyAmount = dailyCfg.creditRewards?.daily ?? 25;
    const now = new Date();
    const lastClaim = (user as any).lastDailyReward as Date | undefined;
    if (lastClaim) {
      const hoursSince = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 20) {
        const hoursLeft = Math.ceil(20 - hoursSince);
        await bot.sendMessage(chatId,
          `🎁 Daily Reward\n\n⏳ You already claimed today's reward!\n\nNext reward in: ${hoursLeft}h\n\nCome back later for ${dailyAmount} more credits!`,
          { reply_markup: { inline_keyboard: [[{ text: "📊 My Account", callback_data: "account_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
        );
        return;
      }
    }
    (user as any).lastDailyReward = now;
    await user.save();
    const newBal = await addCredits(user.userId, dailyAmount);
    await bot.sendMessage(chatId,
      `🎁 Daily Reward Claimed!\n\n+${dailyAmount} credits added!\n💰 New balance: ${newBal} credits\n\nCome back in 20 hours for your next reward!`,
      { reply_markup: { inline_keyboard: [[{ text: "💰 Credits", callback_data: "credits_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /achievements — show earned badges
  if (text === "/achievements") {
    const badges = user.achievements ?? [];
    const total = Object.keys((await import("../services/engagement.js")).ACHIEVEMENTS).length;
    await bot.sendMessage(chatId,
      formatAchievementsText(badges),
      { parse_mode: "Markdown", reply_markup: achievementsKeyboard() }
    );
    return;
  }

  // /privacy — explain what data is stored and how to delete it
  if (text === "/privacy") {
    await bot.sendMessage(chatId,
      `🔒 *Privacy & Your Data*\n\n` +
      `Nova stores the following to work properly:\n\n` +
      `• *Profile* — Name, Telegram ID, username\n` +
      `• *Settings* — Your style, language, and preferences\n` +
      `• *Chat Memory* — Recent conversation context (for better AI replies)\n` +
      `• *Usage Stats* — Message counts and feature usage\n` +
      `• *Projects* — Website/app builds you created\n` +
      `• *Credits & Premium* — Your balance and subscription status\n\n` +
      `🚫 *What we do NOT store:*\n` +
      `• Your voice messages (discarded after transcription)\n` +
      `• Payment details (processed externally)\n\n` +
      `You can clear your chat memory with /forget, or request full data deletion below.`,
      { parse_mode: "Markdown", reply_markup: privacyKeyboard() }
    );
    return;
  }

  // /deletedata — request full data deletion (two-step: confirmation required)
  if (text === "/deletedata") {
    setPending(user.userId, "deletedata_confirm");
    await bot.sendMessage(chatId,
      `⚠️ *Delete All My Data*\n\n` +
      `This will permanently delete:\n` +
      `• Your profile & settings\n` +
      `• All chat memory\n` +
      `• Your premium status & credits\n` +
      `• Build history\n\n` +
      `This action *cannot be undone*.\n\n` +
      `Type \`DELETE MY DATA\` to confirm, or /cancel to abort.`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /updates — show what's new in Nova
  if (text === "/updates") {
    await bot.sendMessage(chatId,
      `✨ *What's New in Nova*\n\n` +
      `🔥 *Recent Updates:*\n\n` +
      `• 🎯 *Smart Suggestions* — After each action, Nova suggests what to try next\n` +
      `• 🏆 *Achievements* — Earn badges as you use Nova (/achievements)\n` +
      `• 🔥 *Login Streaks* — Track your daily activity streak\n` +
      `• 🌐 *Website Builder* — Improved AI models with 4 fallbacks\n` +
      `• 🔊 *Long Text TTS* — Voice now works for paragraphs, not just short phrases\n` +
      `• 👋 *Personalized Welcome* — Quick-access shortcuts to your recent tools\n` +
      `• 🔒 *Privacy Controls* — See and manage your stored data (/privacy)\n` +
      `• 🎨 *Image Editing* — Edit, enhance, stylize & restore photos with AI\n` +
      `• 🎭 *AI Modes* — 10+ specialist modes: dev, chef, coach, therapist & more\n` +
      `• 🛡️ *Content Moderation* — Jailbreak & prompt-injection protection active\n\n` +
      `Have feedback? Use /feedback to share your thoughts!`,
      { parse_mode: "Markdown", reply_markup: updatesKeyboard() }
    );
    return;
  }

  // /refer — show referral link
  if (text === "/refer") {
    if (!user.referralCode) {
      user.referralCode = `NOVA${user.userId.toString(36).toUpperCase()}`;
      await user.save();
    }
    const referralCfg = await getOrCreateBotConfig();
    const referrerBonus = referralCfg.creditRewards?.referrer ?? 50;
    const newUserBonus = referralCfg.creditRewards?.newUser ?? 20;
    let botUsername = "nova_ai_bot";
    try { const me = await bot.getMe(); botUsername = me.username ?? botUsername; } catch {}
    const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;
    await bot.sendMessage(chatId,
      `👥 Your Referral Link\n\nShare this link with friends!\n\n🔗 ${link}\n\nYour code: \`${user.referralCode}\`\nFriends referred: ${user.referrals?.length ?? 0}\n\nWhen a friend joins:\n• You get: +${referrerBonus} credits + 7 days VIP\n• They get: +${newUserBonus} credits + 3 days VIP`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "📊 My Account", callback_data: "account_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /credits — show credit balance and menu
  if (text === "/credits") {
    const creditsCfg = await getOrCreateBotConfig();
    const currentCredits = (user as any).credits ?? 0;
    const chatCost  = creditsCfg.creditCosts?.chat   ?? 1;
    const imageCost = creditsCfg.creditCosts?.image  ?? 5;
    const buildCost = creditsCfg.creditCosts?.build  ?? 20;
    const ttsCost   = creditsCfg.creditCosts?.tts    ?? 3;
    await bot.sendMessage(chatId,
      `💰 Credits\n\nBalance: ${currentCredits} credits\n\nCredit costs:\n• 💬 Chat: ${chatCost} credit\n• 🎨 Image: ${imageCost} credits\n• 🌐 Build: ${buildCost} credits\n• 🔊 Voice: ${ttsCost} credits\n\n${user.premium.active ? "⭐ VIP — No credit deductions!" : "Upgrade to VIP to skip all credit costs!"}`,
      { reply_markup: creditsMenuKeyboard(hasAnyPaymentProvider()) }
    );
    return;
  }

  // /menu — show main menu
  if (text === "/menu") {
    await bot.sendMessage(chatId, e ? `Hey ${name}! What would you like to do?` : "Main menu:", { reply_markup: mainMenuKeyboard() });
    return;
  }

  // /forget
  if (text === "/forget") {
    await clearMemory(user.userId, chatId);
    await bot.sendMessage(chatId,
      e ? "Memory cleared! Fresh start — I remember nothing now 🧹" : "Memory cleared. Starting fresh.",
      { reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /cancel — cancel any pending action
  if (text === "/cancel") {
    const pending = getPending(user.userId);
    if (pending) {
      clearPending(user.userId);
      await bot.sendMessage(chatId,
        e ? "✅ Action cancelled! What else can I help you with?" : "Action cancelled.",
        { reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
      );
    } else {
      await bot.sendMessage(chatId,
        e ? "Nothing to cancel! You're not in the middle of any action." : "Nothing to cancel.",
        { reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
      );
    }
    return;
  }

  // /stats — personal usage stats
  if (text === "/stats") {
    const premiumLine = user.premium.active
      ? `✨ Premium${user.premium.expiresAt ? ` (expires ${formatDate(user.premium.expiresAt)})` : ""}`
      : "Free";
    const imageLimit = await getImageLimit(user.premium.active);
    const daysSinceJoin = Math.floor((Date.now() - user.firstSeen.getTime()) / 86400000);
    const builds = user.usage.builds ?? 0;
    const statsCredits = (user as any).credits ?? 0;
    await bot.sendMessage(chatId,
      `📊 Your Stats\n\n` +
      `👤 ${name}\n` +
      `🆔 ID: ${user.userId}\n` +
      `🗓️ Member for: ${daysSinceJoin} day${daysSinceJoin !== 1 ? "s" : ""}\n` +
      `💎 Plan: ${premiumLine}\n` +
      `💰 Credits: ${statsCredits}\n\n` +
      `── Today ──\n` +
      `💬 Messages: ${user.usage.messages}\n` +
      `🖼️ Images: ${user.usage.images}/${imageLimit >= 999999 ? "∞" : imageLimit}\n` +
      `✏️ Photo Edits: ${user.usage.edits ?? 0}/${user.premium.active ? "∞" : 5}\n\n` +
      `── All Time ──\n` +
      `🔨 Builds: ${builds}\n` +
      `👥 Referrals: ${user.referrals?.length ?? 0}\n` +
      `🎭 Style: ${user.settings.style}\n` +
      `🌐 Language: ${user.settings.language || "en"}`,
      { reply_markup: { inline_keyboard: [[{ text: "👤 Profile", callback_data: "show_profile" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /redeem <code>  (exact command — do NOT use startsWith to avoid matching /redeemcd)
  const firstWord = text.trim().split(/\s+/)[0].split("@")[0];
  if (firstWord === "/redeem") {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) { await bot.sendMessage(chatId, "Usage: /redeem CODE"); return; }
    const code = parts[1].toUpperCase();
    const redeemCode = await RedeemCode.findOne({ code });
    if (!redeemCode) { await bot.sendMessage(chatId, "Invalid code. Check and try again."); return; }
    if (redeemCode.used) { await bot.sendMessage(chatId, "This code has already been used."); return; }
    if (redeemCode.expiresAt && new Date() > redeemCode.expiresAt) { await bot.sendMessage(chatId, "This code has expired."); return; }
    redeemCode.used = true;
    redeemCode.usedBy = user.userId;
    redeemCode.usedAt = new Date();
    await redeemCode.save();
    const expiresAt = redeemCode.durationDays >= 99999 ? undefined : addDays(new Date(), redeemCode.durationDays);
    user.premium.active = true;
    user.premium.expiresAt = expiresAt;
    user.premium.plan = redeemCode.duration;
    await user.save();
    track("premium_redeemed", user.userId, chatId).catch(() => {});
    await bot.sendMessage(chatId,
      `Code redeemed successfully!\n\nYou are now a Premium member!\nDuration: ${redeemCode.duration}\nExpires: ${expiresAt ? formatDate(expiresAt) : "Never"}`
    );
    return;
  }

  // /style
  if (text.startsWith("/style")) {
    const parts = text.trim().split(/\s+/);
    const valid = ["friendly", "funny", "serious", "balanced"];
    const chosen = parts[1]?.toLowerCase();
    if (!chosen || !valid.includes(chosen)) { await bot.sendMessage(chatId, "Valid styles: friendly, funny, serious, balanced"); return; }
    user.settings.style = chosen as any;
    await user.save();
    await bot.sendMessage(chatId, `Style set to: ${chosen}`);
    return;
  }

  // /length
  if (text.startsWith("/length")) {
    const parts = text.trim().split(/\s+/);
    const chosen = parts[1]?.toLowerCase();
    if (chosen !== "long" && chosen !== "short") { await bot.sendMessage(chatId, "Valid options: long, short"); return; }
    user.settings.length = chosen;
    await user.save();
    await bot.sendMessage(chatId, `Reply length set to: ${chosen}`);
    return;
  }

  // /emoji
  if (text.startsWith("/emoji")) {
    const parts = text.trim().split(/\s+/);
    const chosen = parts[1]?.toLowerCase();
    if (chosen !== "on" && chosen !== "off") { await bot.sendMessage(chatId, "Valid options: on, off"); return; }
    user.settings.emoji = chosen === "on";
    await user.save();
    await bot.sendMessage(chatId, `Emojis turned ${chosen}.`);
    return;
  }

  // /lang <en|ar|fr|es>
  if (text.startsWith("/lang")) {
    const parts = text.trim().split(/\s+/);
    const langs: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German", zh: "Chinese", hi: "Hindi", pt: "Portuguese" };
    const chosen = parts[1]?.toLowerCase();
    if (!chosen || !langs[chosen]) {
      await bot.sendMessage(chatId, `Supported languages: ${Object.entries(langs).map(([k, v]) => `${k} (${v})`).join(", ")}`);
      return;
    }
    user.settings.language = chosen;
    await user.save();
    await bot.sendMessage(chatId, `Language set to: ${langs[chosen]}`);
    return;
  }

  // /mood <mood>
  if (text.startsWith("/mood")) {
    const parts = text.trim().split(/\s+/);
    const validMoods = ["happy", "sad", "stressed", "bored", "excited", "angry", "anxious", "tired", "motivated", "neutral"];
    const chosen = parts[1]?.toLowerCase();
    if (!chosen || !validMoods.includes(chosen)) {
      await bot.sendMessage(chatId,
        `How are you feeling right now? Tap one below:`,
        { reply_markup: moodPickerKeyboard() }
      );
      return;
    }
    user.mood = chosen;
    await user.save();
    const moodResponses: Record<string, string> = {
      happy: "That's great! I love seeing you in a good mood!",
      sad: "I'm sorry to hear that. I'm here for you whenever you need to talk.",
      stressed: "Take a deep breath. I'm here to help however I can.",
      bored: "Let's fix that! Ask me anything or request an image.",
      excited: "Your excitement is contagious! What are we talking about?",
      angry: "I hear you. Talking it out can help. What's on your mind?",
      anxious: "It's okay. I'm here. We can take it slow.",
      tired: "Rest is important. I'll keep my answers concise for now.",
      motivated: "Let's make the most of it! What are we working on?",
      neutral: "All good. I'm here whenever you need me.",
    };
    await bot.sendMessage(chatId,
      `Mood set to: ${chosen}.\n\n${moodResponses[chosen] || ""}`,
      { reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /image <prompt>
  if (text.startsWith("/image")) {
    const prompt = text.replace(/^\/image\s*/i, "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId, e ? "Give me a prompt!\nExample: /image a beautiful sunset over mountains" : "Usage: /image <prompt>");
      return;
    }
    await handleImageGeneration(bot, chatId, user, prompt, e);
    return;
  }

  // /translate <text>
  if (text.startsWith("/translate")) {
    const toTranslate = text.replace(/^\/translate\s*/i, "").trim();
    if (!toTranslate) { await bot.sendMessage(chatId, "Usage: /translate <text>\nExample: /translate Bonjour le monde"); return; }
    const stopTyping = startTypingLoop(bot, chatId);
    const translationPrompt = `Translate the following text to English. Only respond with the translation, nothing else:\n\n"${toTranslate}"`;
    const reply = await chat(user.userId, chatId + 9999, translationPrompt, { style: "serious", emoji: false, length: "short" }, user.premium.active);
    stopTyping();
    await bot.sendMessage(chatId, `Translation:\n${reply}`);
    return;
  }

  // /summarize — summarize our conversation
  if (text === "/summarize") {
    const stopTyping = startTypingLoop(bot, chatId);
    const summarizePrompt = "Please summarize our conversation so far in 3-5 bullet points. Be concise.";
    const reply = await chat(user.userId, chatId, summarizePrompt, { style: "serious", emoji: false, length: "short" }, user.premium.active);
    stopTyping();
    await bot.sendMessage(chatId, `Conversation Summary:\n\n${reply}`);
    return;
  }

  // /quote
  if (text === "/quote") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(user.userId, chatId + 1111, "Give me one inspiring or thought-provoking quote. Format: \"Quote\" — Author. No intro, just the quote.", { style: "friendly", emoji: e, length: "short" }, user.premium.active);
    stopTyping();
    await bot.sendMessage(chatId, `💬 Quote\n\n${reply}`, { reply_markup: repeatKeyboard("quick_quote", "fun_menu") });
    return;
  }

  // /fact
  if (text === "/fact") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(user.userId, chatId + 2222, "Tell me one surprising, mind-blowing, and true fact. Keep it to 2-3 sentences. Start directly with the fact.", { style: "funny", emoji: e, length: "short" }, user.premium.active);
    stopTyping();
    await bot.sendMessage(chatId, `🎲 Did You Know?\n\n${reply}`, { reply_markup: repeatKeyboard("quick_fact", "fun_menu") });
    return;
  }

  // /tip
  if (text === "/tip") {
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(user.userId, chatId + 3333, "Give me one specific, actionable productivity, health, or life improvement tip. 2-3 sentences. No generic advice.", { style: "balanced", emoji: e, length: "short" }, user.premium.active);
    stopTyping();
    await bot.sendMessage(chatId, `💡 Tip\n\n${reply}`, { reply_markup: repeatKeyboard("quick_tip", "main_menu") });
    return;
  }

  // /ask <question> — quick AI answer without saving to memory
  if (text.startsWith("/ask")) {
    const question = text.replace(/^\/ask\s*/i, "").trim();
    if (!question) { await bot.sendMessage(chatId, "Usage: /ask <question>"); return; }
    const stopTyping = startTypingLoop(bot, chatId);
    const reply = await chat(user.userId, chatId + 5555, question, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
    stopTyping();
    await safeSend(bot, chatId, reply);
    return;
  }

  // /feedback <message>
  if (text.startsWith("/feedback")) {
    const feedbackText = text.replace(/^\/feedback\s*/i, "").trim();
    if (!feedbackText) { await bot.sendMessage(chatId, "Usage: /feedback <your message>\nExample: /feedback I love Nova!"); return; }
    const ownerIdStr = process.env.OWNER_ID;
    if (ownerIdStr) {
      const ownerId = parseInt(ownerIdStr);
      const senderName = user.username ? `@${user.username}` : (user.firstName || String(user.userId));
      try {
        await bot.sendMessage(ownerId,
          `Feedback from ${senderName} (ID: ${user.userId}):\n\n${feedbackText}`
        );
        user.feedbackCount = (user.feedbackCount || 0) + 1;
        await user.save();
        try {
          const { Feedback } = await import("../models/Feedback.js");
          await new Feedback({ userId: user.userId, username: user.username, firstName: user.firstName, message: feedbackText, type: "feedback" }).save();
        } catch {}
        await bot.sendMessage(chatId, "Thank you! Your feedback has been sent to the Nova team.");
      } catch {
        await bot.sendMessage(chatId, "Could not send feedback right now. Please try again later.");
      }
    } else {
      await bot.sendMessage(chatId, "Feedback system is not configured yet.");
    }
    return;
  }

  // /search <query> — web search with AI synthesis
  if (text.startsWith("/search")) {
    const query = text.replace(/^\/search\s*/i, "").trim();
    if (!query) {
      await bot.sendMessage(chatId,
        "Usage: /search <query>\nExample: /search latest AI news"
      );
      return;
    }
    const status = await startLiveStatus(bot, chatId, "🔍 Searching the web");
    try {
      const results = await webSearch(query);
      const raw = formatSearchResults(query, results);
      if (results.length === 0) {
        status.stop();
        await status.delete();
        await bot.sendMessage(chatId, `No results found for: "${query}"\n\nTry rephrasing your search.`);
        return;
      }
      status.update("🧠 Summarizing results");
      const aiPrompt = `Based on these web search results for "${query}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention the source context.`;
      const aiReply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
      status.stop();
      await status.delete();
      await safeSend(bot, chatId, `🔍 Web Search: ${query}\n\n${aiReply}\n\n──────\n${results.slice(0, 2).map(r => r.url).filter(Boolean).join("\n")}`);
    } catch (err) {
      status.stop();
      await status.delete();
      logger.error({ err }, "Search error");
      await bot.sendMessage(chatId, "Search failed. Please try again.");
    }
    return;
  }

  // /history — show conversation history summary
  if (text === "/history") {
    const stopTyping = startTypingLoop(bot, chatId);
    try {
      const historyPrompt =
        "Give me a detailed summary of our conversation history so far. List:\n" +
        "• Topics we've discussed\n" +
        "• Questions I asked\n" +
        "• Key things you've told me\n" +
        "• Any preferences or settings I've mentioned\n\n" +
        "If there's no significant history yet, say so briefly.";
      const reply = await chat(user.userId, chatId, historyPrompt, { style: "serious", emoji: false, length: "long" }, user.premium.active);
      stopTyping();
      await safeSend(bot, chatId, `📜 Conversation History\n\n${reply}`, {
        reply_markup: { inline_keyboard: [[{ text: "🧹 Clear History", callback_data: "forget_memory" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] }
      });
    } catch {
      stopTyping();
      await bot.sendMessage(chatId, "Could not retrieve history. Try again.");
    }
    return;
  }

  // /remind <time> <message> or /remind cancel <id>
  if (text.startsWith("/remind")) {
    const parts = text.replace(/^\/remind\s*/i, "").trim();
    if (!parts) {
      await bot.sendMessage(chatId,
        "⏰ Reminder Usage:\n\n" +
        "/remind 30m Take a break\n" +
        "/remind 2h Call mom\n" +
        "/remind 1d Pay rent\n\n" +
        "Use /reminders to see your upcoming reminders."
      );
      return;
    }
    if (parts.toLowerCase().startsWith("cancel")) {
      const shortId = parts.split(/\s+/)[1];
      if (!shortId) {
        await bot.sendMessage(chatId, "Usage: /remind cancel <reminder_id>\nUse /reminders to see IDs.");
        return;
      }
      // Display shows last 6 chars of ObjectId — resolve to full _id before cancelling
      const allReminders = await listUserReminders(user.userId);
      const target = allReminders.find((r) => (r._id as any).toString().slice(-6) === shortId);
      if (!target) {
        await bot.sendMessage(chatId, "Reminder not found. Use /reminders to see your current reminders and their IDs.");
        return;
      }
      const cancelled = await cancelReminder((target._id as any).toString(), user.userId);
      await bot.sendMessage(chatId, cancelled ? "✅ Reminder cancelled." : "Reminder not found or already sent.");
      return;
    }
    const tokens = parts.split(/\s+/);
    const durationStr = tokens[0];
    const reminderMsg = tokens.slice(1).join(" ");
    if (!reminderMsg) {
      await bot.sendMessage(chatId,
        "Please include a reminder message.\nExample: /remind 1h Check the laundry"
      );
      return;
    }
    const delayMs = parseDurationToMs(durationStr);
    if (!delayMs || delayMs < 10000) {
      await bot.sendMessage(chatId,
        "Invalid time format. Use:\n• 30s (seconds)\n• 10m (minutes)\n• 2h (hours)\n• 1d (days)\n\nExample: /remind 30m Take a break"
      );
      return;
    }
    const triggerAt = new Date(Date.now() + delayMs);
    await createReminder(bot, user.userId, chatId, reminderMsg, triggerAt);
    const timeLabel =
      delayMs < 60000 ? `${Math.round(delayMs / 1000)}s` :
      delayMs < 3600000 ? `${Math.round(delayMs / 60000)}m` :
      delayMs < 86400000 ? `${(delayMs / 3600000).toFixed(1)}h` :
      `${(delayMs / 86400000).toFixed(1)}d`;
    await bot.sendMessage(chatId,
      `⏰ Reminder set!\n\n"${reminderMsg}"\n\nI'll remind you in ${timeLabel} (${formatDate(triggerAt)})`,
      { reply_markup: { inline_keyboard: [[{ text: "📋 My Reminders", callback_data: "list_reminders" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /reminders — list upcoming reminders
  if (text === "/reminders") {
    const reminders = await listUserReminders(user.userId);
    if (reminders.length === 0) {
      await bot.sendMessage(chatId,
        "⏰ You have no upcoming reminders.\n\nSet one with:\n/remind 30m Take a break\n/remind 2h Call mom",
        { reply_markup: { inline_keyboard: [[{ text: "➕ Set Reminder", callback_data: "remind_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
      return;
    }
    const lines = reminders.map((r, i) => {
      const id = (r._id as any).toString().slice(-6);
      return `${i + 1}. ⏰ ${formatDate(r.triggerAt)}\n   "${r.message.substring(0, 60)}${r.message.length > 60 ? "…" : ""}"\n   ID: ${id}`;
    });
    const cancelBtns = reminders.map((r) => ([{
      text: `❌ ${r.message.substring(0, 30)}${r.message.length > 30 ? "…" : ""}`,
      callback_data: `cancel_rem_${(r._id as any).toString().slice(-6)}`,
    }]));
    await bot.sendMessage(chatId,
      `📋 Your Reminders (${reminders.length})\n\n${lines.join("\n\n")}`,
      { reply_markup: { inline_keyboard: [...cancelBtns, [{ text: "➕ Add Reminder", callback_data: "remind_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /deploy [description] — generate + deploy to Vercel, or deploy last build
  if (text.startsWith("/deploy")) {
    const prompt = text.replace(/^\/deploy\s*/i, "").trim();
    const vercelToken = await resolveVercelToken(user);
    if (!vercelToken) {
      await bot.sendMessage(chatId,
        `🚀 No Vercel token found.\n\n` +
        `Add your token in ⚙️ Settings → 🚀 Deployments, or set VERCEL_TOKEN in Replit Secrets.\n` +
        `Get a token at: vercel.com → Settings → Tokens`,
        { reply_markup: { inline_keyboard: [[{ text: "⚙️ Set Vercel Token", callback_data: "settings_deployments" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
      return;
    }
    if (!prompt) {
      const cached = await getCachedBuild(user.userId);
      if (cached) {
        await handleDeployToVercel(bot, chatId, user, cached.project, vercelToken, e);
      } else {
        await bot.sendMessage(chatId,
          `🚀 Deploy to Vercel\n\n` +
          `Usage: /deploy <describe what you want>\n\n` +
          `This generates a complete project AND deploys it live in one step!\n\n` +
          `Examples:\n• /deploy portfolio website for a photographer\n• /deploy React calculator app\n• /deploy todo app with dark mode\n\n` +
          `💡 You can also run /build first, then /deploy to deploy that last build.`,
          { reply_markup: backToMainKeyboard() }
        );
      }
      return;
    }
    await handleDeployRequest(bot, chatId, user, prompt, vercelToken, e);
    return;
  }

  // /build <description> — AI project generator + GitHub deployment
  if (text.startsWith("/build")) {
    const prompt = text.replace(/^\/build\s*/i, "").trim();
    if (!prompt) {
      const ghCreds = await resolveGitHubCreds(user);
      await bot.sendMessage(chatId,
        `🌐 AI Website & App Builder\n\n` +
        `Usage: /build <describe what you want>\n\n` +
        `Examples:\n` +
        `• /build portfolio website for a photographer\n` +
        `• /build Netflix clone with movie cards\n` +
        `• /build todo app with dark mode\n` +
        `• /build React dashboard with live charts\n` +
        `• /build real-time chat app with Node.js\n\n` +
        `Nova will generate a complete, working project and ${ghCreds ? "push it to your GitHub automatically 🚀" : "send you all the files directly 📁"}\n\n` +
        (ghCreds ? "" : `💡 Go to ⚙️ Settings → 🔑 GitHub to connect your account for automatic deployment.`),
        { reply_markup: backToMainKeyboard() }
      );
      return;
    }
    await handleBuildRequest(bot, chatId, user, prompt, e);
    return;
  }

  // /daily — daily reward with streak system
  if (text === "/daily") {
    const now = new Date();
    const lastReward = user.lastDailyReward;
    const msIn24h = 24 * 60 * 60 * 1000;
    if (lastReward && now.getTime() - lastReward.getTime() < msIn24h) {
      const hoursLeft = Math.ceil((new Date(lastReward.getTime() + msIn24h).getTime() - now.getTime()) / (60 * 60 * 1000));
      const streak = user.streak || 0;
      await bot.sendMessage(chatId,
        `⏳ Already claimed today!\n\n` +
        `🔥 Streak: ${streak} day${streak !== 1 ? 's' : ''}\n` +
        `⏰ Next reward in ${hoursLeft}h\n\n` +
        `Keep your streak going — longer streaks unlock better rewards!`,
        { reply_markup: { inline_keyboard: [[{ text: "👥 Refer a Friend", callback_data: "refer_link" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
      return;
    }
    const streak = user.streak || 0;
    const { dailyRewardKeyboard } = await import("../utils/keyboards.js");
    await bot.sendMessage(chatId,
      `🎁 Daily Reward Ready!\n\n` +
      `🔥 Current streak: ${streak} day${streak !== 1 ? 's' : ''}\n\n` +
      `Tap below to claim your reward! Luck decides what you get — longer streaks mean better odds for rare rewards.`,
      { reply_markup: dailyRewardKeyboard() }
    );
    return;
  }

  // /refer — referral link
  if (text === "/refer" || text === "/referral" || text === "/invite") {
    const { getBotUsername } = await import("../index.js");
    const referralLink = `https://t.me/${getBotUsername()}?start=ref_${user.userId}`;
    const refs = (user.referrals || []).length;
    await bot.sendMessage(chatId,
      `👥 Refer & Earn\n\n` +
      `Share your link — earn Premium for both of you!\n\n` +
      `🔗 Your referral link:\n${referralLink}\n\n` +
      `Rewards:\n` +
      `• Your friend gets 3 days Premium 🎁\n` +
      `• You get 7 days Premium 🎉\n` +
      `• Already premium? It extends your time!\n\n` +
      `📊 Total referrals: ${refs} friend${refs !== 1 ? 's' : ''}`,
      { reply_markup: { inline_keyboard: [[{ text: "🎁 Daily Reward", callback_data: "daily_claim" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /describe — prompt user to send a photo for AI analysis
  if (text === "/describe" || text.startsWith("/describe ")) {
    const config = await getOrCreateBotConfig();
    if (!config.features?.imageAnalysisEnabled) {
      await bot.sendMessage(chatId, "Image analysis is temporarily unavailable, will be available soon.");
      return;
    }
    setPending(user.userId, "describe_photo");
    await bot.sendMessage(chatId,
      "🔍 Send me a photo and I'll describe or analyze it!\n\nYou can also add a caption with a specific question.",
      { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /sticker <prompt> — create a sticker-ready image
  if (text.startsWith("/sticker")) {
    const prompt = text.replace(/^\/sticker\s*/i, "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId,
        "🖼️ Usage: /sticker <description>\n\nExamples:\n• /sticker happy cat waving\n• /sticker cute anime girl with stars\n• /sticker fire dragon emoji style"
      );
      return;
    }
    await handleStickerGeneration(bot, chatId, user, prompt, e);
    return;
  }

  // /poll Question | Option 1 | Option 2 — create a poll in private chat
  if (text.startsWith("/poll")) {
    const rawText = text.replace(/^\/poll\s*/i, "").trim();
    if (!rawText || !rawText.includes("|")) {
      await bot.sendMessage(chatId,
        `${e ? "📊 " : ""}Usage: /poll Question | Option 1 | Option 2\n\nExample:\n/poll Favorite season? | Spring | Summer | Autumn | Winter`
      );
      return;
    }
    const parts = rawText.split("|").map(p => p.trim()).filter(Boolean);
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
    } catch {
      await bot.sendMessage(chatId, "Failed to create poll. Please try again.");
    }
    return;
  }

  // /export — download your conversation history as a text file
  if (text.startsWith("/export")) {
    const memory = await Memory.findOne({ userId: user.userId, chatId });
    if (!memory || memory.messages.length === 0) {
      await bot.sendMessage(chatId, `${e ? "📭 " : ""}No conversation history to export yet.`);
      return;
    }
    const lines: string[] = [
      `Nova AI — Conversation Export`,
      `User: ${user.firstName || user.username || String(user.userId)}`,
      `Exported: ${new Date().toUTCString()}`,
      `Messages: ${memory.messages.length}`,
      `${"─".repeat(40)}`,
      "",
    ];
    for (const m of memory.messages) {
      const role = m.role === "user" ? "You" : "Nova";
      const ts = m.ts ? new Date(m.ts).toLocaleString() : "";
      lines.push(`[${role}]${ts ? ` (${ts})` : ""}`);
      lines.push(m.content);
      lines.push("");
    }
    const content = lines.join("\n");
    const buf = Buffer.from(content, "utf-8");
    const filename = `nova-chat-${user.userId}-${Date.now()}.txt`;
    try {
      await bot.sendDocument(chatId, buf, { caption: `${e ? "📄 " : ""}Your conversation export (${memory.messages.length} messages)` }, { filename, contentType: "text/plain" });
    } catch {
      await bot.sendMessage(chatId, "Failed to generate export. Please try again.");
    }
    return;
  }

  // Ignore unknown slash commands
  if (text.startsWith("/")) return;

  // ── Auto-detect generation intents from natural language ────────────────────
  const imagePrompt = detectImageIntent(text);
  if (imagePrompt) {
    await handleImageGeneration(bot, chatId, user, imagePrompt, e);
    return;
  }

  const stickerPrompt = detectStickerIntent(text);
  if (stickerPrompt) {
    await handleStickerGeneration(bot, chatId, user, stickerPrompt, e);
    return;
  }

  const searchQuery = detectSearchIntent(text);
  if (searchQuery) {
    const searchStatus = await startLiveStatus(bot, chatId, "🔍 Searching the web");
    try {
      const results = await webSearch(searchQuery);
      const raw = formatSearchResults(searchQuery, results);
      if (results.length === 0) {
        searchStatus.stop();
        await searchStatus.delete();
        await bot.sendMessage(chatId, `No results found for: "${searchQuery}"\n\nTry rephrasing.`,
          { reply_markup: { inline_keyboard: [[{ text: "🔍 Try Again", callback_data: "search_again" }]] } });
        return;
      }
      searchStatus.update("🧠 Summarizing results");
      const aiPrompt = `Based on these web search results for "${searchQuery}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention relevant sources.`;
      const aiReply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
      searchStatus.stop();
      await searchStatus.delete();
      const sourceLines = results.slice(0, 3).map(r => r.url).filter(Boolean);
      await safeSend(bot, chatId,
        `🔍 ${searchQuery}\n\n${aiReply}${sourceLines.length ? `\n\n──────\n${sourceLines.join("\n")}` : ""}`,
        { reply_markup: { inline_keyboard: [[{ text: "🔍 Search Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
    } catch {
      searchStatus.stop();
      await searchStatus.delete();
      await bot.sendMessage(chatId, "Search failed. Please try again.");
    }
    return;
  }

  // ── Build intent (natural language) ──────────────────────────────────────────
  const buildDesc = detectBuildIntent(text);
  if (buildDesc) {
    await handleBuildRequest(bot, chatId, user, buildDesc, e);
    return;
  }

  // ── Summarize intent (natural language) ───────────────────────────────────────
  const summarizeText = detectSummarizeIntent(text);
  if (summarizeText) {
    const status = await startLiveStatus(bot, chatId, "📝 Summarizing your text");
    try {
      const reply = await chat(user.userId, chatId + 5556, `Summarize the following text in clear bullet points:\n\n${summarizeText}`, { style: "serious", emoji: e, length: "short" }, user.premium.active);
      status.stop();
      await status.delete();
      await safeSend(bot, chatId, `📝 Summary:\n\n${reply}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] } });
    } catch {
      status.stop();
      await status.delete();
      await bot.sendMessage(chatId, "Summarization failed. Please try again.");
    }
    return;
  }

  // ── Translate intent (natural language) ───────────────────────────────────────
  const translateMatch = detectTranslateIntent(text);
  if (translateMatch) {
    const status = await startLiveStatus(bot, chatId, `🌐 Translating to ${translateMatch.targetLang}`);
    try {
      const reply = await chat(user.userId, chatId + 9999, `Translate the following to ${translateMatch.targetLang}. Only respond with the translation, no explanation:\n\n"${translateMatch.content}"`, { style: "serious", emoji: false, length: "short" }, user.premium.active);
      status.stop();
      await status.delete();
      await safeSend(bot, chatId, `🌐 ${translateMatch.targetLang} translation:\n\n${reply}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] } });
    } catch {
      status.stop();
      await status.delete();
      await bot.sendMessage(chatId, "Translation failed. Please try again.");
    }
    return;
  }

  // ── Plain text → AI chat ─────────────────────────────────────────────────

  // Credit check (skip for premium users)
  if (!user.premium.active) {
    const chatCost = await getCreditCost("chat");
    const userCredits = (user as any).credits ?? 0;
    if (userCredits < chatCost) {
      await bot.sendMessage(chatId,
        `💰 You're out of credits!\n\nYou need ${chatCost} credit to chat.\nBalance: ${userCredits} credits\n\nEarn free credits:\n• 🎁 Claim your daily reward\n• 👥 Refer friends for bonus credits`,
        { reply_markup: insufficientCreditsKeyboard() }
      );
      return;
    }
    await deductCredits(user.userId, chatCost);
  }

  // Per-day message limit check
  const msgLimCfg = await getOrCreateBotConfig();
  const msgLimit = user.premium.active ? msgLimCfg.usageLimits.premiumMessages : msgLimCfg.usageLimits.freeMessages;
  if (msgLimit >= 0 && user.usage.messages >= msgLimit) {
    await bot.sendMessage(chatId,
      `Daily message limit reached (${msgLimit}/day). Resets tomorrow.` +
      (user.premium.active ? "" : " Upgrade to /premium for more messages.")
    );
    return;
  }

  user.usage.messages += 1;
  await user.save();
  const stopTyping = startTypingLoop(bot, chatId);
  const reply = await chat(user.userId, chatId, text, user.settings, user.premium.active, user.mood ?? undefined);
  stopTyping();
  await sendAIReply(bot, chatId, reply);

  // Track feature usage + check achievements (non-blocking)
  Promise.all([
    updateRecentFeatures(user.userId, "chat"),
    trackFeature(user.userId, "chat"),
    updateLoginStreak(user.userId),
    checkAndGrantAchievements(user.userId, "chat").then(async (unlocked) => {
      if (unlocked.length > 0) {
        await bot.sendMessage(chatId, formatAchievementToast(unlocked), { parse_mode: "Markdown" }).catch(() => {});
      }
    }),
  ]).catch(() => {});
}


// ── Pending text action handler (for button-triggered multi-step flows) ────────

async function handlePendingText(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  actionType: string,
  input: string,
  e: boolean,
  pendingData?: Record<string, string>,
  messageId?: number
): Promise<void> {
  const stopTyping = startTypingLoop(bot, chatId);
  try {
    switch (actionType) {
      case "ai_ask": {
        const reply = await chat(user.userId, chatId + 5555, input, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
        await safeSend(bot, chatId, reply, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "ai_summarize_input": {
        const reply = await chat(user.userId, chatId + 5556, `Summarize the following text in 3-5 bullet points:\n\n${input}`, { style: "serious", emoji: false, length: "short" }, user.premium.active);
        await bot.sendMessage(chatId, `Summary:\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "ai_translate": {
        const reply = await chat(user.userId, chatId + 9999, `Translate the following to English. Only respond with the translation:\n\n"${input}"`, { style: "serious", emoji: false, length: "short" }, user.premium.active);
        await bot.sendMessage(chatId, `Translation:\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "feedback_pending": {
        const feedbackText = input.trim();
        if (feedbackText.length < 3) {
          await bot.sendMessage(chatId, "Please enter at least a few words of feedback.", { reply_markup: backToMainKeyboard() });
          break;
        }
        const ownerId = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID, 10) : null;
        const senderName = user.username ? `@${user.username}` : (user.firstName || String(user.userId));
        if (ownerId) {
          try { await bot.sendMessage(ownerId, `📣 Feedback from ${senderName} (ID: ${user.userId}):\n\n${feedbackText}`); } catch {}
        }
        try {
          const { Feedback } = await import("../models/Feedback.js");
          await new Feedback({ userId: user.userId, username: user.username, firstName: user.firstName, message: feedbackText, type: "feedback" }).save();
        } catch {}
        await bot.sendMessage(chatId, `✅ Thanks for your feedback, ${user.firstName || "friend"}! It's been sent to the team.`, { reply_markup: backToMainKeyboard() });
        break;
      }
      case "deletedata_confirm": {
        if (input.trim() !== "DELETE MY DATA") {
          await bot.sendMessage(chatId,
            `❌ Confirmation didn't match. Type exactly \`DELETE MY DATA\` to confirm deletion, or /cancel to abort.`,
            { parse_mode: "Markdown" }
          );
          setPending(user.userId, "deletedata_confirm");
          break;
        }
        await bot.sendMessage(chatId, "⏳ Deleting your data…");
        try {
          await Promise.all([
            User.deleteOne({ userId: user.userId }),
            Memory.deleteMany({ userId: user.userId }),
          ]);
          await bot.sendMessage(chatId,
            `✅ All your data has been permanently deleted.\n\n` +
            `Start fresh anytime with /start. Goodbye!`
          );
        } catch {
          await bot.sendMessage(chatId, "❌ Something went wrong during deletion. Please try again or contact support.");
        }
        break;
      }
      case "ai_generate": {
        const reply = await chat(user.userId, chatId + 5557, `Write the following: ${input}`, { style: user.settings.style, emoji: e, length: "long" }, user.premium.active);
        await safeSend(bot, chatId, reply, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "img_generate_text": {
        const styleMap: Record<string, string> = {
          anime: "anime art style, vibrant colors, cel shading",
          cyberpunk: "cyberpunk aesthetic, neon lights, dark city, futuristic",
          fantasy: "epic fantasy art, dramatic lighting, detailed illustration",
          realistic: "photorealistic, ultra detailed, 8k photography",
          oil: "oil painting style, textured brushstrokes, classical art",
          watercolor: "soft watercolor painting, gentle washes, artistic",
          sketch: "detailed pencil sketch, black and white, fine line art",
          pixel: "pixel art style, retro 16-bit, colorful pixelated",
        };
        const preset = pendingData?.preset;
        const styledPrompt = preset && styleMap[preset]
          ? `${input}, ${styleMap[preset]}`
          : input;
        await handleImageGeneration(bot, chatId, user, styledPrompt, e);
        break;
      }
      case "fun_8ball": {
        const pool = [
          "It is certain.", "Without a doubt.", "Yes, definitely!",
          "Most likely.", "Outlook is good.", "Signs point to yes.",
          "Ask again later.", "Cannot predict now.", "Concentrate and ask again.",
          "Don't count on it.", "My reply is no.", "Very doubtful.",
          "Outlook not so good.", "My sources say no.", "Better not tell you now.",
        ];
        const answer = pool[Math.floor(Math.random() * pool.length)];
        await bot.sendMessage(chatId,
          `🎱 Magic 8-Ball\n\nQuestion: ${input}\n\nAnswer: ${answer}`,
          { reply_markup: funMenuKeyboard() }
        );
        break;
      }
      case "fun_ship": {
        const parts = input.trim().split(/\s+/);
        const n1 = parts[0] || "Person A";
        const n2 = parts[1] || "Person B";
        const pct = Math.floor(Math.random() * 101);
        const verdict =
          pct >= 80 ? "A match made in heaven!" :
          pct >= 60 ? "Great compatibility!" :
          pct >= 40 ? "Some sparks there..." :
          pct >= 20 ? "It's complicated." : "Maybe stay friends.";
        const bar = "❤️".repeat(Math.round(pct / 20)) + "🖤".repeat(5 - Math.round(pct / 20));
        await bot.sendMessage(chatId,
          `💘 Compatibility Results\n\n${n1} + ${n2}\n\n${bar} ${pct}%\n\n${verdict}`,
          { reply_markup: funMenuKeyboard() }
        );
        break;
      }
      case "fun_roast_name": {
        const roast = await chat(user.userId, chatId + 7003,
          `Give ${input} a funny, light-hearted roast in 2-3 sentences. Keep it playful, not offensive.`,
          { style: "funny", emoji: e, length: "short" }, user.premium.active
        );
        await bot.sendMessage(chatId, `🔥 Roast\n\n${roast}`, { reply_markup: funMenuKeyboard() });
        break;
      }
      case "write_tweet": {
        const reply = await chat(user.userId, chatId + 9001,
          `Write a punchy, engaging tweet about: ${input}\n\nRules: max 260 characters, no hashtag spam (at most 2), no "here's a tweet" intro — just the tweet itself.`,
          { style: user.settings.style, emoji: e, length: "short" }, user.premium.active
        );
        await safeSend(bot, chatId, `🐦 Tweet\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "write_caption": {
        const reply = await chat(user.userId, chatId + 9002,
          `Write an engaging Instagram caption for: ${input}\n\nInclude 5-8 relevant hashtags at the end. No intro — just the caption and hashtags.`,
          { style: user.settings.style, emoji: e, length: "short" }, user.premium.active
        );
        await safeSend(bot, chatId, `📸 Instagram Caption\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "write_bio": {
        const reply = await chat(user.userId, chatId + 9003,
          `Write a compelling, memorable bio based on this: ${input}\n\nMake it feel authentic and distinctive. Keep it under 150 characters. No intro.`,
          { style: user.settings.style, emoji: e, length: "short" }, user.premium.active
        );
        await safeSend(bot, chatId, `👤 Bio\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "write_lyrics": {
        const reply = await chat(user.userId, chatId + 9004,
          `Write original song lyrics about: ${input}\n\nInclude one verse and one chorus. Make them flow naturally with rhythm. No intro text.`,
          { style: user.settings.style, emoji: false, length: "long" }, user.premium.active
        );
        await safeSend(bot, chatId, `🎵 Song Lyrics\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "write_email": {
        const reply = await chat(user.userId, chatId + 9005,
          `Write a professional, well-structured email for this situation: ${input}\n\nInclude subject line, greeting, body, and sign-off. No meta-commentary.`,
          { style: "serious", emoji: false, length: "long" }, user.premium.active
        );
        await safeSend(bot, chatId, `📧 Email\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "write_poem": {
        const reply = await chat(user.userId, chatId + 9006,
          `Write a beautiful, original poem about: ${input}\n\nMake it evocative and memorable. Any style. No intro — just the poem.`,
          { style: user.settings.style, emoji: false, length: "short" }, user.premium.active
        );
        await safeSend(bot, chatId, `🎭 Poem\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "ai_debate": {
        const reply = await chat(user.userId, chatId + 9007,
          `Debate both sides of: "${input}"\n\nFormat:\nSide A (For):\n[3 strong arguments]\n\nSide B (Against):\n[3 strong arguments]\n\nVerdict: [1 sentence on which side has the stronger case]\n\nBe sharp, fair, and thought-provoking.`,
          { style: "serious", emoji: e, length: "long" }, user.premium.active
        );
        await safeSend(bot, chatId, `🗣️ Debate: ${input}\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "ai_analyze": {
        const reply = await chat(user.userId, chatId + 9008,
          `Analyze the following text and break it down:\n\n"${input}"\n\nProvide:\n• Tone (e.g. formal, casual, aggressive)\n• Emotion (what feeling does it convey)\n• Intent (what is the writer trying to do)\n• Writing style (e.g. persuasive, descriptive, narrative)\n• Readability (who is the target audience)\n\nBe concise and insightful.`,
          { style: "serious", emoji: false, length: "short" }, user.premium.active
        );
        await safeSend(bot, chatId, `🔬 Text Analysis\n\n${reply}`, { reply_markup: aiMenuKeyboard() });
        break;
      }
      case "search_input": {
        const searchStatus3 = await startLiveStatus(bot, chatId, "🔍 Searching the web");
        try {
          const results = await webSearch(input);
          const raw = formatSearchResults(input, results);
          if (results.length === 0) {
            searchStatus3.stop();
            await searchStatus3.delete();
            await bot.sendMessage(chatId, `No results found for: "${input}"\n\nTry rephrasing.`,
              { reply_markup: { inline_keyboard: [[{ text: "🔍 Try Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } });
            break;
          }
          searchStatus3.update("🧠 Summarizing results");
          const aiPrompt = `Based on these web search results for "${input}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention relevant sources.`;
          const reply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
          searchStatus3.stop();
          await searchStatus3.delete();
          const sourceLines = results.slice(0, 3).map(r => r.url).filter(Boolean);
          await safeSend(bot, chatId,
            `🔍 ${input}\n\n${reply}${sourceLines.length ? `\n\n──────\n${sourceLines.join("\n")}` : ""}`,
            { reply_markup: { inline_keyboard: [[{ text: "🔍 Search Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
          );
        } catch {
          searchStatus3.stop();
          await searchStatus3.delete();
          await bot.sendMessage(chatId, "Search failed. Please try again.",
            { reply_markup: { inline_keyboard: [[{ text: "🔍 Try Again", callback_data: "search_again" }]] } });
        }
        break;
      }
      case "remind_input": {
        const tokens = input.split(/\s+/);
        const durationStr = tokens[0];
        const reminderMsg = tokens.slice(1).join(" ");
        if (!reminderMsg) {
          await bot.sendMessage(chatId, "Please include a message after the time.\nExample: 1h Call mom");
          break;
        }
        const delayMs = parseDurationToMs(durationStr);
        if (!delayMs || delayMs < 10000) {
          await bot.sendMessage(chatId, "Invalid time. Use formats like: 30m, 2h, 1d");
          break;
        }
        const triggerAt = new Date(Date.now() + delayMs);
        await createReminder(bot, user.userId, chatId, reminderMsg, triggerAt);
        await bot.sendMessage(chatId,
          `⏰ Reminder set!\n\n📅 When: ${formatDate(triggerAt)}\n💬 "${reminderMsg}"`,
          { reply_markup: { inline_keyboard: [[{ text: "📋 View All Reminders", callback_data: "reminders_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
        );
        break;
      }
      case "voice_tts_input": {
        await handleTTS(bot, chatId, user, input, e);
        break;
      }
      case "sticker_input": {
        await handleStickerGeneration(bot, chatId, user, input, e);
        break;
      }
      case "grp_set_welcome": {
        const gid = parseInt(pendingData?.groupChatId ?? "0");
        if (!gid) { await bot.sendMessage(chatId, "❌ Could not find the group. Please try again from the group settings."); break; }
        const { GroupSettings: GS } = await import("../models/GroupSettings.js");
        const gs = await GS.findOneAndUpdate({ chatId: gid }, { welcomeMessage: input.trim() }, { new: true, upsert: true });
        await bot.sendMessage(chatId,
          `✅ Welcome message updated!\n\nNew members in the group will see:\n\n_${gs?.welcomeMessage}_`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "main_menu" }]] } }
        );
        break;
      }
      case "grp_set_goodbye": {
        const gid = parseInt(pendingData?.groupChatId ?? "0");
        if (!gid) { await bot.sendMessage(chatId, "❌ Could not find the group. Please try again from the group settings."); break; }
        const { GroupSettings: GS } = await import("../models/GroupSettings.js");
        const gs = await GS.findOneAndUpdate({ chatId: gid }, { goodbyeMessage: input.trim() }, { new: true, upsert: true });
        await bot.sendMessage(chatId,
          `✅ Goodbye message updated!\n\nMembers leaving the group will see:\n\n_${gs?.goodbyeMessage}_`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "main_menu" }]] } }
        );
        break;
      }
      case "grp_set_rules": {
        const gid = parseInt(pendingData?.groupChatId ?? "0");
        if (!gid) { await bot.sendMessage(chatId, "❌ Could not find the group. Please try again from the group settings."); break; }
        const { GroupSettings: GS } = await import("../models/GroupSettings.js");
        await GS.findOneAndUpdate({ chatId: gid }, { rules: input.trim() }, { upsert: true });
        await bot.sendMessage(chatId,
          `✅ Group rules updated!\n\nMembers can view the rules with /rules in the group.`,
          { reply_markup: { inline_keyboard: [[{ text: "🏠 Menu", callback_data: "main_menu" }]] } }
        );
        break;
      }
      case "fun_truth_reply": {
        const reply = await chat(user.userId, chatId + 8006,
          `The user was asked a deep truth question and replied: "${input}"\n\nRespond thoughtfully and empathetically, like a wise friend reflecting on their answer. Be genuine, not preachy. 2-3 sentences.`,
          { style: "balanced", emoji: e, length: "short" }, user.premium.active
        );
        await bot.sendMessage(chatId, `💭 ${reply}`, { reply_markup: funMenuKeyboard() });
        break;
      }
      case "github_set_username": {
        const trimmed = input.trim().replace(/^@/, "");
        if (!trimmed || /\s/.test(trimmed) || trimmed.length > 39) {
          await bot.sendMessage(chatId,
            "❌ Invalid username. Please send just your GitHub username (no spaces, max 39 characters).",
            { reply_markup: backToSettingsKeyboard() }
          );
          break;
        }
        await User.updateOne({ userId: user.userId }, { "github.username": trimmed });
        await bot.sendMessage(chatId,
          `✅ GitHub username saved: @${trimmed}\n\nNow set your token via ⚙️ Settings → 🔑 GitHub → Set Token to enable automatic project pushing.`,
          { reply_markup: backToSettingsKeyboard() }
        );
        break;
      }
      case "github_set_token": {
        const token = input.trim();
        try { if (messageId) await bot.deleteMessage(chatId, messageId); } catch {}
        if (!token || token.length < 10) {
          await bot.sendMessage(chatId,
            "❌ That doesn't look like a valid token. Please try again from ⚙️ Settings → 🔑 GitHub.",
            { reply_markup: backToSettingsKeyboard() }
          );
          break;
        }
        const encrypted = encrypt(token);
        await User.updateOne({ userId: user.userId }, { "github.tokenEncrypted": encrypted });
        await bot.sendMessage(chatId,
          `✅ GitHub token saved securely!\n\n` +
          `🔒 Your token is AES-256 encrypted and stored safely. Nova will use it automatically every time you run /build.\n\n` +
          `To remove or update it: ⚙️ Settings → 🔑 GitHub`,
          { reply_markup: backToSettingsKeyboard() }
        );
        break;
      }
      case "vercel_set_token": {
        const tok = input.trim();
        try { if (messageId) await bot.deleteMessage(chatId, messageId); } catch {}
        if (!tok || tok.length < 10) {
          await bot.sendMessage(chatId,
            "❌ That doesn't look like a valid Vercel token. Please try again.",
            { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
          );
          break;
        }
        const encVercel = encrypt(tok);
        await User.updateOne({ userId: user.userId }, { vercelTokenEncrypted: encVercel });
        await bot.sendMessage(chatId,
          `✅ Vercel token saved securely!\n\n🔒 Encrypted with AES-256. Ready to deploy!`,
          { reply_markup: { inline_keyboard: [
            [{ text: "⚡ Deploy Now", callback_data: "deploy_live" }],
            [{ text: "⚙️ Deployments", callback_data: "settings_deployments" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
          ]}}
        );
        break;
      }
      case "render_set_token": {
        const tok = input.trim();
        try { if (messageId) await bot.deleteMessage(chatId, messageId); } catch {}
        if (!tok || tok.length < 10) {
          await bot.sendMessage(chatId,
            "❌ That doesn't look like a valid Render API key. Please try again.",
            { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
          );
          break;
        }
        const encRender = encrypt(tok);
        await User.updateOne({ userId: user.userId }, { renderTokenEncrypted: encRender });
        await bot.sendMessage(chatId,
          `✅ Render API key saved securely!\n\n🔒 Encrypted with AES-256. Ready to deploy!`,
          { reply_markup: { inline_keyboard: [
            [{ text: "🟣 Deploy Now", callback_data: "deploy_render" }],
            [{ text: "⚙️ Deployments", callback_data: "settings_deployments" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
          ]}}
        );
        break;
      }
      case "build_input": {
        await handleBuildRequest(bot, chatId, user, input, e);
        break;
      }
      default:
        await bot.sendMessage(chatId, "Something went wrong. Try again from the menu.", { reply_markup: mainMenuKeyboard() });
    }
  } catch (err) {
    logger.error({ err, actionType }, "Error handling pending text action");
    await bot.sendMessage(chatId, "Something went wrong, try again later.", { reply_markup: mainMenuKeyboard() });
  } finally {
    stopTyping();
  }
}

// ── Photo message handler (exported — called from index.ts) ───────────────────

export async function handlePhotoMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser
): Promise<void> {
  const chatId = msg.chat.id;

  if (user.banned) return;

  const pending = getPending(user.userId);

  if (!pending || !PHOTO_ACTIONS.has(pending.type)) {
    // Auto-analyze any photo sent without a pending image action
    const photos = msg.photo;
    if (!photos || photos.length === 0) return;
    const photo = photos[photos.length - 1];
    const question = msg.caption?.trim();

    const status = await startLiveStatus(
      bot, chatId,
      question ? `🔍 Analyzing your image` : "🔍 Analyzing your image",
      "upload_photo"
    );

    try {
      const imageBuffer = await downloadTelegramPhoto(bot, photo.file_id);
      if (!imageBuffer) {
        status.stop();
        await status.delete();
        await bot.sendMessage(chatId, "Failed to download your image. Please try again.");
        return;
      }

      status.update("🔍 Running image analysis");
      const rawAnalysis = await analyzeImage(imageBuffer, question);
      status.stop();
      await status.delete();

      if (!rawAnalysis) {
        await bot.sendMessage(chatId,
          "I couldn't analyze this image right now — the model may be warming up. Try again in a moment.",
          { reply_markup: imageMenuKeyboard() }
        );
        return;
      }

      const enrichStatus = await startLiveStatus(bot, chatId, "🧠 Generating description");
      const enrichPrompt = question
        ? `The user asked: "${question}"\nAbout an image described as: "${rawAnalysis}"\n\nAnswer their question about the image naturally and helpfully. If the description doesn't answer it directly, say so and give what you can.`
        : `Describe this image to the user in an interesting and helpful way. The vision model identified it as: "${rawAnalysis}"\n\nExpand on this naturally, mentioning details, mood, and what stands out.`;

      const fullReply = await chat(
        user.userId, chatId + 7777, enrichPrompt,
        { style: user.settings.style, emoji: user.settings.emoji, length: "short" },
        user.premium.active
      );
      enrichStatus.stop();
      await enrichStatus.delete();

      const header = question ? `🔍 Image Analysis\n\nQ: ${question}\n\n` : `🖼 Image Description\n\n`;
      await safeSend(bot, chatId, header + fullReply, { reply_markup: imageMenuKeyboard() });
    } catch (err) {
      status.stop();
      await status.delete();
      logger.error({ err }, "Photo auto-analysis error");
      await bot.sendMessage(chatId, "Something went wrong analyzing this image. Try again.", {
        reply_markup: imageMenuKeyboard(),
      });
    }
    return;
  }

  const editDailyLimit = user.premium.active ? 999999 : 5;
  const currentEdits = user.usage.edits ?? 0;
  if (currentEdits >= editDailyLimit) {
    await bot.sendMessage(chatId,
      `Daily photo edit limit reached (${editDailyLimit >= 999999 ? "∞" : editDailyLimit}/day).` +
      (user.premium.active ? "" : " Upgrade to VIP for unlimited edits — tap 💰 Credits."),
      { reply_markup: user.premium.active ? undefined : insufficientCreditsKeyboard() }
    );
    clearPending(user.userId);
    return;
  }

  const photos = msg.photo;
  if (!photos || photos.length === 0) return;
  const photo = photos[photos.length - 1];

  // For edit/stylize, caption is the prompt — keep pending if missing
  if ((pending.type === "img_edit" || pending.type === "img_stylize") && !msg.caption?.trim()) {
    await bot.sendMessage(chatId,
      pending.type === "img_edit"
        ? "Please resend the photo with a caption describing what to change.\nExample: make it look like a watercolor painting"
        : "Please resend the photo with a caption describing the style.\nExample: anime, oil painting, cyberpunk"
    );
    return;
  }

  clearPending(user.userId);

  const imgActionLabel: Record<string, string> = {
    img_edit: "✏️ Editing your image",
    img_enhance: "✨ Enhancing your image",
    img_stylize: "🎨 Stylizing your image",
    img_restore: "🔧 Restoring your image",
  };
  const imgStatus = await startLiveStatus(
    bot, chatId,
    imgActionLabel[pending.type] || "🖼️ Processing your image",
    "upload_photo"
  );

  try {
    const imageBuffer = await downloadTelegramPhoto(bot, photo.file_id);
    if (!imageBuffer) {
      imgStatus.stop();
      await imgStatus.delete();
      await bot.sendMessage(chatId, "Failed to download your photo. Please try again.", { reply_markup: imageMenuKeyboard() });
      return;
    }

    let prompt = "";
    let result: Buffer | null = null;

    switch (pending.type) {
      case "img_edit":
        prompt = msg.caption!.trim();
        result = await editImage(imageBuffer, prompt);
        break;
      case "img_enhance":
        prompt = "high quality, sharp, enhanced, professional photography, 4K detail";
        result = await editImage(imageBuffer, `enhance this image: ${prompt}`);
        break;
      case "img_stylize":
        prompt = msg.caption!.trim();
        result = await editImage(imageBuffer, `stylize in ${prompt} style`);
        break;
      case "img_restore":
        prompt = "restore this photo, clean, sharp, noise-free, high quality, no damage";
        result = await editImage(imageBuffer, prompt);
        break;
    }

    imgStatus.stop();
    await imgStatus.delete();

    if (!result) {
      await bot.sendMessage(chatId,
        "Image processing failed. The model may be loading — try again in 30 seconds.",
        { reply_markup: imageMenuKeyboard() }
      );
      return;
    }

    user.usage.edits = (user.usage.edits ?? 0) + 1;
    await user.save();
    track("image_edit", user.userId, chatId).catch(() => {});

    await bot.sendPhoto(chatId, result, {
      caption: `Done! (${pending.type.replace("img_", "").replace("_", " ")})`,
      reply_markup: imageMenuKeyboard() as any,
    });

  } catch (err) {
    imgStatus.stop();
    await imgStatus.delete();
    logger.error({ err }, "Photo processing error");
    await bot.sendMessage(chatId, "Something went wrong. Try again later.", {
      reply_markup: imageMenuKeyboard(),
    });
  }
}

// ── Website/App builder ───────────────────────────────────────────────────────

async function handleBuildRequest(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  prompt: string,
  e: boolean
): Promise<void> {
  const cooldownMs = checkBuildCooldown(user.userId);
  if (cooldownMs > 0) {
    const secs = Math.ceil(cooldownMs / 1000);
    await bot.sendMessage(chatId, `⏳ Please wait ${secs}s before building again.\n\nBuilding takes significant resources — one at a time!`);
    return;
  }

  // Project limit for free users
  const FREE_PROJECT_LIMIT = 2;
  if (!user.premium.active && (user.projects?.length ?? 0) >= FREE_PROJECT_LIMIT) {
    await bot.sendMessage(chatId,
      `📁 You've reached the free project limit (${FREE_PROJECT_LIMIT} projects).\n\nDelete a project to make room, or upgrade to Premium for unlimited projects.`,
      { reply_markup: { inline_keyboard: [[{ text: "📁 My Projects", callback_data: "my_projects" }, { text: "💎 Go Premium", callback_data: "settings_premium" }]] } }
    );
    return;
  }

  // Daily build limit check
  const buildLimCfg = await getOrCreateBotConfig();
  const buildLimit = user.premium.active ? buildLimCfg.usageLimits.premiumBuilds : buildLimCfg.usageLimits.freeBuilds;
  if (buildLimit >= 0 && (user.usage.builds ?? 0) >= buildLimit) {
    await bot.sendMessage(chatId,
      `Daily build limit reached (${buildLimit}/day). Resets tomorrow.` +
      (user.premium.active ? "" : " Upgrade to /premium for more daily builds.")
    );
    return;
  }

  // Credit check for build
  if (!user.premium.active) {
    const buildCost = await getCreditCost("build");
    const userCredits = (user as any).credits ?? 0;
    if (userCredits < buildCost) {
      await bot.sendMessage(chatId,
        `💰 Building a project costs ${buildCost} credits.\n\nYou have ${userCredits} credits.\n\nEarn more credits to continue!`,
        { reply_markup: insufficientCreditsKeyboard() }
      );
      return;
    }
    await deductCredits(user.userId, buildCost);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await bot.sendMessage(chatId, "AI service is not configured. Ask the bot owner to set up OPENROUTER_API_KEY.");
    return;
  }

  setBuildCooldown(user.userId);

  const ghCreds = await resolveGitHubCreds(user);
  const githubToken = ghCreds?.token;
  const githubUsername = ghCreds?.username;
  const hasGitHub = !!(githubToken && githubUsername);

  const buildStatus = await startLiveStatus(bot, chatId, "🔨 Building your project");

  // ── Step 1: Generate project files ─────────────────────────────────────────
  let project;
  try {
    project = await generateProject(prompt, apiKey, (msg) => buildStatus.update(msg));
  } catch (err: any) {
    buildStatus.stop();
    await buildStatus.delete();
    clearBuildCooldown(user.userId);
    // Refund credits — generation failed, user should not be charged
    if (!user.premium.active) {
      const refundCost = await getCreditCost("build");
      try { await addCredits(user.userId, refundCost); } catch {}
    }
    logger.error({ err }, "Project generation failed");
    const errDetail = err?.message ? `\n\n${err.message}` : "";
    await bot.sendMessage(chatId,
      `❌ Generation failed. Try being more specific, e.g. "portfolio website for a photographer" or "todo app with dark mode".${errDetail}`,
      { reply_markup: buildResultKeyboard() }
    );
    return;
  }

  const label = typeLabel(project.type);
  const fileCount = project.files.length;
  await cacheUserBuild(user.userId, project, prompt);

  // ── Step 2a: GitHub push ────────────────────────────────────────────────────
  if (hasGitHub) {
    buildStatus.update(`✅ Code ready! (${fileCount} files — ${label})\n📤 Pushing to GitHub`);

    const rawName = sanitizeRepoName(project.name);
    let repoName = rawName;

    try {
      const exists = await repoExists(githubToken!, githubUsername!, rawName);
      if (exists) repoName = uniqueRepoName(rawName);
    } catch {}

    let repoInfo: Awaited<ReturnType<typeof createGitHubRepo>>;
    try {
      repoInfo = await createGitHubRepo(githubToken!, repoName, project.description);
    } catch (err: any) {
      buildStatus.stop();
      await buildStatus.delete();
      logger.error({ err }, "GitHub repo creation failed");
      const reason =
        err?.response?.status === 401
          ? "GitHub authentication failed. Check your GITHUB_TOKEN secret."
          : err?.response?.status === 422
          ? `A repo named "${repoName}" already exists.`
          : `GitHub error: ${err?.response?.data?.message || err.message}`;
      await bot.sendMessage(chatId, `⚠️ ${reason}\n\nSending files directly instead...`);
      // Still count the build and save the project even when GitHub fails
      try {
        await User.findOneAndUpdate({ userId: user.userId }, {
          $inc: { "usage.builds": 1 },
          $push: { projects: { name: project.name, repoUrl: undefined, deployUrl: undefined, createdAt: new Date() } },
        });
      } catch {}
      await sendProjectFiles(bot, chatId, project, e);
      return;
    }

    buildStatus.update(`✅ Repository created! Uploading ${fileCount} files`);

    let lastDone = 0;
    try {
      await pushAllFiles(
        githubToken!,
        githubUsername!,
        repoInfo.name,
        project.files,
        async (done, total) => {
          lastDone = done;
          buildStatus.update(`📤 Uploading files (${done}/${total})`);
        }
      );
    } catch (err) {
      // Retry remaining files once
      logger.warn({ err, lastDone }, "Partial upload failure — retrying remaining files");
      try {
        await pushAllFiles(githubToken!, githubUsername!, repoInfo.name, project.files.slice(lastDone));
      } catch {
        buildStatus.stop();
        await buildStatus.delete();
        await bot.sendMessage(chatId,
          `⚠️ Uploaded ${lastDone}/${fileCount} files. Repo: ${repoInfo.htmlUrl}\n\nSending remaining files directly...`,
          { reply_markup: buildResultKeyboard(repoInfo.htmlUrl) }
        );
        await sendProjectFiles(bot, chatId, project, e, lastDone);
        return;
      }
    }

    buildStatus.stop();
    await buildStatus.delete();

    user.usage.builds = (user.usage.builds ?? 0) + 1;
    user.projects = user.projects ?? [];
    user.projects.push({ name: project.name, repoUrl: repoInfo.htmlUrl, deployUrl: undefined, createdAt: new Date() } as any);
    await user.save();

    await cacheUserBuild(user.userId, project, prompt, repoInfo.htmlUrl);

    await bot.sendMessage(chatId,
      `🚀 Your project is ready!\n\n` +
      `📦 ${project.name}\n` +
      `${project.description}\n\n` +
      `🔗 ${repoInfo.htmlUrl}\n\n` +
      `${fileCount} files · ${label}\n\n` +
      `💡 ${project.deploymentTip}`,
      { reply_markup: buildResultKeyboard(repoInfo.htmlUrl) }
    );
    return;
  }

  // ── Step 2b: No GitHub — ask what user wants to do ──────────────────────────
  buildStatus.stop();
  await buildStatus.delete();

  const choiceKeyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "📤 Push to GitHub", callback_data: "build_choice_github" },
        { text: "📱 Send to Telegram", callback_data: "build_choice_telegram" },
      ],
      [
        { text: "⚡ Deploy to Vercel", callback_data: "deploy_live" },
        { text: "🟣 Deploy to Render", callback_data: "deploy_render" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };

  await bot.sendMessage(chatId,
    `✅ Project generated!\n\n` +
    `📦 ${project.name}\n` +
    `${project.description}\n\n` +
    `${fileCount} files · ${label}\n\n` +
    `💡 ${project.deploymentTip}\n\n` +
    `What would you like to do with your project?`,
    { reply_markup: choiceKeyboard }
  );
}

// ── Deploy request: generate + deploy in one shot ────────────────────────────

async function handleDeployRequest(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  prompt: string,
  vercelToken: string,
  e: boolean
): Promise<void> {
  const cooldownMs = checkBuildCooldown(user.userId);
  if (cooldownMs > 0) {
    const secs = Math.ceil(cooldownMs / 1000);
    await bot.sendMessage(chatId, `⏳ Please wait ${secs}s before deploying again.`);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await bot.sendMessage(chatId, "AI service not configured. OPENROUTER_API_KEY is missing.");
    return;
  }

  setBuildCooldown(user.userId);

  const statusMsg = await bot.sendMessage(chatId,
    `🔨 Generating your project...\n\n"${prompt.substring(0, 100)}"\n\nThis takes 1-3 minutes — generation + deployment.`
  );
  const stopTyping = startTypingLoop(bot, chatId);

  let project;
  try {
    project = await generateProject(prompt, apiKey);
  } catch (err: any) {
    stopTyping();
    logger.error({ err }, "Deploy-generate failed");
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
    const errDetail = err?.message ? `\n\n${err.message}` : "";
    await bot.sendMessage(chatId, `❌ Project generation failed. The AI had trouble with this prompt — please try again with a more specific description.${errDetail}`);
    return;
  }

  await cacheUserBuild(user.userId, project, prompt);

  stopTyping();
  await handleDeployToVercel(bot, chatId, user, project, vercelToken, e, statusMsg.message_id);
}

// ── Deploy existing project to Vercel ────────────────────────────────────────

async function handleDeployToVercel(
  bot: TelegramBot,
  chatId: number,
  _user: IUser,
  project: Awaited<ReturnType<typeof generateProject>>,
  vercelToken: string,
  e: boolean,
  existingMsgId?: number
): Promise<void> {
  let statusMsgId = existingMsgId;

  const updateStatus = async (text: string) => {
    try {
      if (statusMsgId) {
        await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId });
      } else {
        const m = await bot.sendMessage(chatId, text);
        statusMsgId = m.message_id;
      }
    } catch {}
  };

  await updateStatus(
    `✅ Code ready (${project.files.length} files)\n🚀 Deploying to Vercel...`
  );

  try {
    const result = await deployToVercel(
      vercelToken,
      project.name,
      project.files,
      async (msg) => updateStatus(msg)
    );

    try {
      if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);
    } catch {}

    await bot.sendMessage(chatId,
      `🚀 Live!\n\n` +
      `📦 ${project.name}\n` +
      `${project.description}\n\n` +
      `🌐 ${result.url}\n\n` +
      `${project.files.length} files deployed · ${typeLabel(project.type)}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🌐 Open Live Site", url: result.url }],
            [{ text: "🔍 Vercel Dashboard", url: result.inspectorUrl }],
            [
              { text: "🌐 Build Another", callback_data: "build_menu" },
              { text: "⬅️ Menu", callback_data: "main_menu" },
            ],
          ],
        },
      }
    );
  } catch (firstErr: any) {
    logger.warn({ err: firstErr }, "Vercel deployment failed — attempting auto-fix");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        await updateStatus(`⚠️ Deploy failed — running AI auto-fix...\n\n${firstErr.message.substring(0, 80)}`);
        const fixed = await autoFixProjectFiles(project.files, firstErr.message, project.description, apiKey);
        if (fixed) {
          project.files = fixed;
          await updateStatus(`🔧 Auto-fix applied — retrying deployment...`);
          const retryResult = await deployToVercel(vercelToken, project.name, fixed, async (msg) => updateStatus(msg));
          try { if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId); } catch {}
          await bot.sendMessage(chatId,
            `🚀 Live (after auto-fix)!\n\n📦 ${project.name}\n🌐 ${retryResult.url}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🌐 Open Live Site", url: retryResult.url }],
                  [{ text: "🔍 Vercel Dashboard", url: retryResult.inspectorUrl }],
                  [{ text: "🌐 Build Another", callback_data: "build_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
                ],
              },
            }
          );
          return;
        }
      } catch (fixErr) {
        logger.warn({ err: fixErr }, "Auto-fix retry also failed");
      }
    }
    logger.error({ err: firstErr }, "Vercel deployment failed");
    try {
      if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);
    } catch {}
    await bot.sendMessage(chatId,
      `❌ Deployment failed: ${firstErr.message}\n\n` +
      `Files are still cached — run /deploy to retry.`,
      { reply_markup: backToMainKeyboard() }
    );
  }
}

async function sendProjectFiles(
  bot: TelegramBot,
  chatId: number,
  project: { files: Array<{ path: string; content: string }> },
  _e: boolean,
  startFrom = 0
): Promise<void> {
  const files = project.files.slice(startFrom);
  for (const file of files) {
    try {
      const buf = Buffer.from(file.content, "utf-8");
      const filename = file.path.split("/").pop() || file.path;
      await bot.sendDocument(
        chatId,
        buf,
        { caption: `📄 ${file.path}` },
        { filename, contentType: "text/plain; charset=utf-8" }
      );
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      logger.warn({ err, path: file.path }, "Failed to send project file as document");
    }
  }
}

// ── TTS generation helper ─────────────────────────────────────────────────────

async function handleTTS(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  text: string,
  e: boolean
): Promise<void> {
  const config = await getOrCreateBotConfig();
  if (!config.features?.ttsEnabled) {
    await bot.sendMessage(chatId, "Voice generation is temporarily unavailable, will be available soon.");
    return;
  }
  // Credit check for TTS
  if (!user.premium.active) {
    const ttsCost = await getCreditCost("tts");
    const userCredits = (user as any).credits ?? 0;
    if (userCredits < ttsCost) {
      await bot.sendMessage(chatId,
        `💰 Voice generation costs ${ttsCost} credits.\n\nYou have ${userCredits} credits.`,
        { reply_markup: insufficientCreditsKeyboard() }
      );
      return;
    }
    await deductCredits(user.userId, ttsCost);
  }
  if (text.length > 1000) {
    await bot.sendMessage(chatId, e ? "🔊 Text is too long! Maximum 1000 characters." : "Text too long. Maximum 1000 characters.");
    return;
  }
  const ttsStatus = await startLiveStatus(bot, chatId, "🔊 Generating voice", "upload_video");
  try {
    const provider = config.providers?.tts || "huggingface";
    const voice = config.providers?.ttsVoice || "nova";
    const ttsResult = await generateTTS(text, provider, voice);
    ttsStatus.stop();
    await ttsStatus.delete();
    if (!ttsResult) {
      await bot.sendMessage(chatId, e ? "🔊 Voice generation failed. Try again!" : "Voice generation failed. Please try again.");
      return;
    }
    if (ttsResult.format === "wav") {
      await bot.sendAudio(chatId, ttsResult.buffer, { caption: e ? "🔊 Here's your audio!" : undefined }, { filename: "voice.wav", contentType: "audio/wav" });
    } else {
      await bot.sendVoice(chatId, ttsResult.buffer, { caption: e ? "🔊 Here's your audio!" : undefined });
    }
    Promise.all([
      updateRecentFeatures(user.userId, "tts"),
      trackFeature(user.userId, "tts"),
      checkAndGrantAchievements(user.userId, "tts").then(async (unlocked) => {
        if (unlocked.length > 0) {
          await bot.sendMessage(chatId, formatAchievementToast(unlocked), { parse_mode: "Markdown" }).catch(() => {});
        }
      }),
    ]).catch(() => {});
  } catch (err) {
    ttsStatus.stop();
    await ttsStatus.delete();
    logger.error({ err }, "TTS error");
    await bot.sendMessage(chatId, e ? "🔊 Voice generation failed. Please try again later." : "Voice generation failed. Please try again.");
  }
}

// ── Sticker generation ────────────────────────────────────────────────────────

async function handleStickerGeneration(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  prompt: string,
  e: boolean
): Promise<void> {
  const isPrem = user.premium.active;
  const limit = await getImageLimit(isPrem);
  if (user.usage.images >= limit) {
    await bot.sendMessage(chatId, `Daily image limit reached (${limit}/day).`);
    return;
  }
  const stickerStatus = await startLiveStatus(bot, chatId, "🖼️ Creating your sticker", "upload_photo");
  try {
    const stickerPrompt = `${prompt}, sticker art style, clean white or transparent background, bold outlines, cute and expressive, high contrast, simple design`;
    const imageBuffer = await generateImage(stickerPrompt);
    stickerStatus.stop();
    await stickerStatus.delete();
    if (!imageBuffer) {
      await bot.sendMessage(chatId, "Sticker generation failed. Try again in 30 seconds.");
      return;
    }
    user.usage.images += 1;
    user.totalImages = (user.totalImages ?? 0) + 1;
    await user.save();
    recordLastFeature(user.userId, "sticker").catch(() => {});
    track("sticker_gen", user.userId, chatId).catch(() => {});
    checkAndAwardAchievements(user.userId, { type: "image", count: user.totalImages ?? 0 }).catch(() => {});
    await bot.sendPhoto(chatId, imageBuffer, {
      caption: `🖼️ Sticker: ${prompt.substring(0, 80)}\n\n💡 Save this image → open Telegram Settings → Stickers → Create your own!`,
      reply_markup: { inline_keyboard: [[{ text: "🖼️ Make Another", callback_data: "sticker_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] },
    });
  } catch (err) {
    stickerStatus.stop();
    await stickerStatus.delete();
    logger.error({ err }, "Sticker generation error");
    await bot.sendMessage(chatId, e ? "🖼️ Sticker generation failed. Please try again." : "Sticker generation failed. Please try again.",
      { reply_markup: { inline_keyboard: [[{ text: "🖼️ Try Again", callback_data: "sticker_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
  }
}

// ── Document message handler (exported — called from index.ts) ────────────────

export async function handleDocumentMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser
): Promise<void> {
  const chatId = msg.chat.id;
  if (user.banned) return;

  if (getMaintenance()) {
    await bot.sendMessage(chatId, "Nova is currently under maintenance.");
    return;
  }

  const doc = msg.document;
  if (!doc) return;

  const fileName = doc.file_name || "document";
  const mimeType = doc.mime_type || "";
  const e = user.settings.emoji;

  const statusMsg = await bot.sendMessage(chatId,
    e ? `📄 Reading "${fileName}"...` : `Processing document: ${fileName}`
  );
  const stopTyping = startTypingLoop(bot, chatId);

  try {
    const buffer = await downloadTelegramDocument(bot, doc.file_id);
    if (!buffer) {
      stopTyping();
      await bot.editMessageText("Failed to download the document. Please try again.", {
        chat_id: chatId, message_id: statusMsg.message_id,
      });
      return;
    }

    const text = await extractTextFromDocument(buffer, mimeType, fileName);
    if (!text || text.trim().length < 20) {
      stopTyping();
      await bot.editMessageText(
        "Could not extract text from this file. Supported formats: PDF, TXT, DOCX, MD, CSV, and most code files.",
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
      return;
    }

    const userQuestion = msg.caption?.trim();
    const docPrompt = userQuestion
      ? `The user sent a document "${fileName}" with this content:\n\n${text}\n\nUser's question: ${userQuestion}\n\nAnswer their question based on the document content.`
      : `The user sent a document "${fileName}". Analyze and summarize it:\n\n${text}\n\nProvide:\n• A brief summary (2-3 sentences)\n• Key points (bullet list)\n• Important numbers, dates, or names mentioned\n• Any action items or conclusions`;

    const reply = await chat(
      user.userId, chatId + 6666, docPrompt,
      { style: user.settings.style, emoji: e, length: "long" },
      user.premium.active
    );
    stopTyping();
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
    await safeSend(bot, chatId, `📄 Document: ${fileName}\n\n${reply}`, {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] }
    });
  } catch (err) {
    stopTyping();
    logger.error({ err }, "Document handler error");
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
    await bot.sendMessage(chatId, "Something went wrong reading the document. Please try again.");
  }
}

async function handleImageGeneration(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  prompt: string,
  e: boolean
): Promise<void> {
  const isPrem = user.premium.active;
  const limit = await getImageLimit(isPrem);

  if (user.usage.images >= limit) {
    await bot.sendMessage(chatId,
      `Daily image limit reached (${limit}/day).${isPrem ? "" : " Upgrade to Premium for more: /premium"}`
    );
    return;
  }

  // Credit check for image generation
  if (!isPrem) {
    const imgCost = await getCreditCost("image");
    const userCredits = (user as any).credits ?? 0;
    if (userCredits < imgCost) {
      await bot.sendMessage(chatId,
        `💰 Image generation costs ${imgCost} credits.\n\nYou have ${userCredits} credits.`,
        { reply_markup: insufficientCreditsKeyboard() }
      );
      return;
    }
    await deductCredits(user.userId, imgCost);
  }

  const sentMsg = await bot.sendMessage(chatId, e
    ? "Generating your image... this may take up to 30 seconds."
    : "Generating your image..."
  );
  const stopImgTyping = startTypingLoop(bot, chatId, "upload_photo");

  try {
    const imageBuffer = await generateImage(prompt);
    stopImgTyping();
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}

    if (!imageBuffer) {
      await bot.sendMessage(chatId, "Image generation failed. The model may be warming up — try again in 30 seconds.");
      return;
    }

    user.usage.images += 1;
    user.totalImages = (user.totalImages ?? 0) + 1;
    await user.save();
    recordLastFeature(user.userId, "image").catch(() => {});
    track("image_gen", user.userId, chatId).catch(() => {});
    checkAndAwardAchievements(user.userId, { type: "image", count: user.totalImages ?? 0 }).catch(() => {});
    await bot.sendPhoto(chatId, imageBuffer, { caption: prompt });
  } catch (err) {
    stopImgTyping();
    logger.error({ err }, "Image generation error");
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    await bot.sendMessage(chatId, "Image generation failed. Please try again.");
  }
}
