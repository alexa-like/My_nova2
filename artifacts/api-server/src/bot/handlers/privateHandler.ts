import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { chat, clearMemory } from "../services/ai.js";
import { generateImage, getImageLimit, editImage, downloadTelegramPhoto } from "../services/image.js";
import { analyzeImage } from "../services/imageAnalysis.js";
import { isRateLimited } from "../utils/rateLimiter.js";
import { formatDate, addDays, getUserName, safeSend, startTypingLoop } from "../utils/helpers.js";
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
} from "../utils/keyboards.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { webSearch, formatSearchResults } from "../services/webSearch.js";
import { generateMusic } from "../services/music.js";
import { generateProject, typeLabel } from "../services/projectGenerator.js";
import {
  createGitHubRepo,
  pushAllFiles,
  repoExists,
  sanitizeRepoName,
  uniqueRepoName,
} from "../services/github.js";
import { cacheUserBuild, getCachedBuild } from "../utils/buildCache.js";
import { deployToVercel, deployToRender, autoFixProjectFiles } from "../services/deploy.js";
import { downloadTelegramDocument, extractTextFromDocument } from "../services/document.js";
import { createReminder, listUserReminders, cancelReminder } from "../services/reminder.js";
import { parseDurationToMs } from "../models/Reminder.js";
import { isPremiumEmojiEnabled, applyPremiumEmojiSafe } from "../utils/premiumEmoji.js";
import { track } from "../services/analytics.js";
import { logger } from "../../lib/logger.js";

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

// ── Image intent detection ────────────────────────────────────────────────────

function detectImageIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;

  const patterns = [
    /^(?:generate|create|make|produce)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration|artwork|drawing|painting|wallpaper|render|poster)\s+(?:of|showing|depicting|about|with|for)?\s*(.+)/i,
    /^(?:draw|paint|illustrate|sketch|render|design)\s+(?:me\s+)?(?:an?\s+)?(.+)/i,
    /^(?:show me|gimme|give me)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration)\s+(?:of\s+)?(.+)/i,
    /^(?:image|photo|picture)\s+(?:of\s+|showing\s+)?(.+)/i,
    /^(?:can you|could you|please)\s+(?:generate|create|make|draw|paint|design)\s+(?:an?\s+)?(?:image|photo|picture|illustration|drawing)\s+(?:of|showing|with|about|for)?\s*(.+)/i,
  ];

  const skip = ["me", "that", "this", "one", "some", "it", "anything", "something", "a photo", "an image", "sure", "yes"];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    const captured = match?.[1]?.trim();
    if (match && captured && captured.length > 3) {
      const prompt = captured.replace(/[?.!]+$/, "");
      if (!skip.includes(prompt.toLowerCase())) return prompt;
    }
  }
  return null;
}

// ── Music intent detection ─────────────────────────────────────────────────────

function detectMusicIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const patterns = [
    /^(?:generate|create|make|produce|compose|write)\s+(?:some\s+|me\s+|me\s+some\s+)?(?:music|audio|a song|a beat|a track|a melody|a tune)\s*(?:that|with|about|like|for|of)?\s*(.*)?/i,
    /^(?:play|make)\s+(?:me\s+)?(?:some\s+)?(?:music|a song|a beat|a track)\s*(?:that|with|about|like|for|of)?\s*(.*)?/i,
    /^(?:generate|make|create)\s+(?:a\s+)?(?:lo-?fi|hip-?hop|jazz|classical|ambient|chill|upbeat|epic|sad|happy|calm|relaxing|energetic|electronic|pop|rock|reggae|country)\s+(?:music|beat|track|song|melody|vibe)?\s*(.*)?/i,
    /^(?:can you|could you)\s+(?:generate|create|make|compose|write|play)\s+(?:some\s+)?(?:music|a song|a beat|a track|a melody)\s*(?:that|with|about|like|for|of)?\s*(.*)?/i,
    /^(?:generate|make|create)\s+(?:a\s+)?(?:music|song|beat|track)\s+(?:for|about|with)\s+(.+)/i,
    /^i\s+(?:want|need)\s+(?:some\s+)?(?:music|a beat|a song)\s*(?:that|like|about|with|for)?\s*(.*)?/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const captured = (match[1] || "").trim();
      const fullPrompt = captured.length > 3
        ? captured
        : t.replace(/^(?:generate|create|make|play|compose|produce|write|i want|i need)\s+(?:me\s+)?(?:some\s+)?/i, "").trim();
      if (fullPrompt.length > 3) return fullPrompt.replace(/[?.!]+$/, "");
    }
  }
  return null;
}

// ── Sticker intent detection ───────────────────────────────────────────────────

function detectStickerIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const patterns = [
    /^(?:make|create|generate|design)\s+(?:me\s+)?(?:a\s+)?sticker\s+(?:of|showing|with|depicting|about)?\s*(.+)/i,
    /^(?:can you|could you)\s+(?:make|create|design|generate)\s+(?:a\s+)?sticker\s+(?:of|showing|with|for)?\s*(.+)/i,
    /^sticker\s+(?:of\s+|showing\s+|with\s+)?(.+)/i,
    /^i\s+(?:want|need)\s+(?:a\s+)?sticker\s+(?:of|showing|with)?\s*(.+)/i,
  ];
  const skip = ["me", "that", "this", "one", "it", "a sticker"];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const captured = match?.[1]?.trim();
    if (match && captured && captured.length > 3 && !skip.includes(captured.toLowerCase())) {
      return captured.replace(/[?.!]+$/, "");
    }
  }
  return null;
}

// ── Search intent detection ────────────────────────────────────────────────────

function detectSearchIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const patterns = [
    /^(?:search for|look up|lookup|google|bing|find information about|research)\s+(.+)/i,
    /^search\s+(.+)/i,
    /^(?:find|get)\s+(?:information|info|details|news|facts|data)\s+(?:about|on|regarding)\s+(.+)/i,
    /^(?:what(?:'s| is) the (?:latest|current|recent)\s+(?:news|update|information)\s+(?:about|on|regarding))\s+(.+)/i,
    /^(?:what happened (?:to|with|in))\s+(.+)/i,
    /^(?:tell me (?:the latest|current|recent)\s+(?:news|updates?)\s+(?:about|on))\s+(.+)/i,
    /^(?:latest|current|recent) (?:news|updates?) (?:about|on|regarding) (.+)/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const captured = match?.[1]?.trim();
    if (match && captured && captured.length > 2) {
      return captured.replace(/[?.!]+$/, "");
    }
  }
  return null;
}

// ── Build intent detection ─────────────────────────────────────────────────────

function detectBuildIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 10 || t.startsWith("/")) return null;
  const patterns = [
    /^(?:build|create|make|generate|code|develop)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|blog|e-?commerce\s*(?:store|shop)?|store|shop|platform|tool|calculator|game|app|application)\b/i,
    /^(?:i want|i need|can you build|can you make|can you create|could you build|could you make)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|app|application)\b/i,
    /^(?:build|develop|code)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:react|node(?:js|\.js)?|express|fullstack|full.stack)\s+(?:app|application|project|website)\b/i,
    /^(?:clone|make a clone of|build a clone of)\s+(?:netflix|spotify|twitter|instagram|youtube|airbnb|amazon|reddit|facebook|tiktok|whatsapp|telegram)\b/i,
  ];
  for (const pattern of patterns) {
    if (t.match(pattern)) return t;
  }
  return null;
}

// ── Summarize intent detection ─────────────────────────────────────────────────

function detectSummarizeIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 10 || t.startsWith("/")) return null;
  const patterns = [
    /^(?:summarize|summarise|tldr|tl;dr)\s*:?\s*(.+)/i,
    /^(?:sum up|condense|shorten|make shorter)\s+(?:this|the following)\s*:?\s*(.+)/i,
    /^(?:give me a summary of|what(?:'s| is) the (?:summary|gist|main point) of)\s+(.+)/i,
    /^(?:summarize|summarise)\s+this\s+(?:article|text|passage|document)\s*:?\s*(.*)/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const captured = match?.[1]?.trim();
    if (match && captured && captured.length > 10) return captured;
  }
  return null;
}

// ── Translate intent detection ─────────────────────────────────────────────────

function detectTranslateIntent(text: string): { content: string; targetLang: string } | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const m1 = t.match(/^(?:translate|convert)\s+(.+?)\s+(?:to|into|in)\s+(\w+)\s*$/i);
  if (m1 && m1[1].length > 2) return { content: m1[1], targetLang: m1[2] };
  const m2 = t.match(/^how do you say\s+(.+?)\s+in\s+(\w+)/i);
  if (m2) return { content: m2[1], targetLang: m2[2] };
  const m3 = t.match(/^(?:in|to)\s+([A-Za-z]+):\s*(.+)/i);
  if (m3 && m3[2].length > 3) return { content: m3[2], targetLang: m3[1] };
  const m4 = t.match(/^translate\s+(?:this\s+)?(?:to|into)\s+(\w+)\s*:?\s*(.*)/i);
  if (m4 && m4[2].length > 3) return { content: m4[2], targetLang: m4[1] };
  return null;
}

export async function handleVoiceMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser
): Promise<void> {
  const chatId = msg.chat.id;
  if (user.banned) return;
  await bot.sendMessage(chatId, "Voice messages aren't supported. Please type your message instead!");
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

  // /start — show interactive dashboard with onboarding for new users
  if (text === "/start" || text.startsWith("/start ")) {
    const isNew = Date.now() - user.firstSeen.getTime() < 30000;
    if (isNew) {
      await bot.sendMessage(chatId,
        `👋 Welcome to Nova, ${name}!\n\n` +
        `I'm your personal AI assistant — smarter than a chatbot, more powerful than a search engine.\n\n` +
        `Here's what I can do:\n` +
        `💬 Chat naturally — just type anything!\n` +
        `🎨 Generate images & stickers\n` +
        `🎵 Generate music from a description\n` +
        `🔍 Search the web with AI synthesis\n` +
        `⏰ Set reminders — /remind 1h Call mom\n` +
        `📄 Read & analyze PDFs, DOCX, TXT files\n` +
        `🔨 Build full websites & apps — /build <idea>\n` +
        `🚀 Deploy live to Vercel — /deploy <idea>\n` +
        `🌐 Translate text — just say "translate X to Spanish"\n` +
        `📝 Summarize anything — paste text, say "summarize"\n\n` +
        `💡 Tip: You don't need commands! Just type naturally:\n` +
        `   "draw me a sunset" → generates an image\n` +
        `   "make chill lo-fi music" → generates music\n` +
        `   "build me a portfolio website" → builds it!\n\n` +
        `Use the menu below to get started 👇`
      );
      await bot.sendMessage(chatId, `What would you like to do first?`, { reply_markup: mainMenuKeyboard() });
    } else {
      await bot.sendMessage(chatId,
        `Hey ${name}! Welcome back.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
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
      `🎵 /music <prompt> — Generate music\n` +
      `🖼️ /sticker <prompt> — Generate a sticker\n` +
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
      `🤖 /model — Choose AI model\n` +
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
      `Music today: ${user.usage.music ?? 0}\n` +
      `Total builds: ${builds}\n` +
      `Groups: ${user.groups.length}\n` +
      `Warnings: ${user.warnings}`,
      { reply_markup: { inline_keyboard: [[{ text: "⚙️ Settings", callback_data: "settings_menu" }, { text: "📊 Stats", callback_data: "show_stats" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
    return;
  }

  // /model — AI model selection
  if (text === "/model" || text === "/models") {
    const config = await (await import("../models/BotConfig.js")).getOrCreateBotConfig();
    const currentModel = config.chatModels.find(
      (m) => m.id === (user.preferredChatModel || config.activeChatModel)
    );
    const { userModelKeyboard } = await import("../utils/keyboards.js");
    await bot.sendMessage(chatId,
      `🤖 AI Model\n\n` +
      `Current model: ${currentModel?.name || "Default"}\n` +
      `${user.preferredChatModel ? "You have a custom model set." : "Using the global active model."}\n\n` +
      `Tap to switch:`,
      { reply_markup: userModelKeyboard(config.chatModels, user.preferredChatModel, config.activeChatModel) }
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
        `• Standard AI responses\n\n` +
        `Get Premium with a redeem code:\n/redeem CODE`,
        { reply_markup: backKb }
      );
    }
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
    const statsCfg = await getOrCreateBotConfig();
    const musicLimit = user.premium.active ? statsCfg.usageLimits.premiumMusic : statsCfg.usageLimits.freeMusic;
    const musicLimitStr = musicLimit < 0 ? "∞" : String(musicLimit);
    await bot.sendMessage(chatId,
      `📊 Your Stats\n\n` +
      `👤 ${name}\n` +
      `🆔 ID: ${user.userId}\n` +
      `🗓️ Member for: ${daysSinceJoin} day${daysSinceJoin !== 1 ? "s" : ""}\n` +
      `💎 Plan: ${premiumLine}\n\n` +
      `── Today ──\n` +
      `💬 Messages: ${user.usage.messages}\n` +
      `🖼️ Images: ${user.usage.images}/${imageLimit >= 999999 ? "∞" : imageLimit}\n` +
      `🎵 Music: ${user.usage.music ?? 0}/${musicLimitStr}\n\n` +
      `── All Time ──\n` +
      `🔨 Builds: ${builds}\n` +
      `👥 Groups: ${user.groups.length}\n` +
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
    const statusMsg = await bot.sendMessage(chatId, "🔍 Searching the web...");
    const stopTyping = startTypingLoop(bot, chatId);
    try {
      const results = await webSearch(query);
      const raw = formatSearchResults(query, results);
      if (results.length === 0) {
        stopTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        await bot.sendMessage(chatId, `No results found for: "${query}"\n\nTry rephrasing your search.`);
        return;
      }
      const aiPrompt = `Based on these web search results for "${query}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention the source context.`;
      const aiReply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await safeSend(bot, chatId, `🔍 Web Search: ${query}\n\n${aiReply}\n\n──────\n${results.slice(0, 2).map(r => r.url).filter(Boolean).join("\n")}`);
    } catch (err) {
      stopTyping();
      logger.error({ err }, "Search error");
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
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
      const cached = getCachedBuild(user.userId);
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

  // /music <description> — generate music via HuggingFace musicgen
  if (text.startsWith("/music")) {
    const prompt = text.replace(/^\/music\s*/i, "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId,
        "🎵 Usage: /music <description>\n\nExamples:\n• /music calm lo-fi beats for studying\n• /music epic cinematic orchestral\n• /music upbeat jazz piano"
      );
      return;
    }
    await handleMusicGeneration(bot, chatId, user, prompt, e);
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

  const musicPrompt = detectMusicIntent(text);
  if (musicPrompt) {
    await handleMusicGeneration(bot, chatId, user, musicPrompt, e);
    return;
  }

  const stickerPrompt = detectStickerIntent(text);
  if (stickerPrompt) {
    await handleStickerGeneration(bot, chatId, user, stickerPrompt, e);
    return;
  }

  const searchQuery = detectSearchIntent(text);
  if (searchQuery) {
    const statusMsg = await bot.sendMessage(chatId, e ? "🔍 Searching the web..." : "Searching...");
    const stopSearchTyping = startTypingLoop(bot, chatId);
    try {
      const results = await webSearch(searchQuery);
      const raw = formatSearchResults(searchQuery, results);
      if (results.length === 0) {
        stopSearchTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        await bot.sendMessage(chatId, `No results found for: "${searchQuery}"\n\nTry rephrasing.`,
          { reply_markup: { inline_keyboard: [[{ text: "🔍 Try Again", callback_data: "search_again" }]] } });
        return;
      }
      const aiPrompt = `Based on these web search results for "${searchQuery}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention relevant sources.`;
      const aiReply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
      stopSearchTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      const sourceLines = results.slice(0, 3).map(r => r.url).filter(Boolean);
      await safeSend(bot, chatId,
        `🔍 ${searchQuery}\n\n${aiReply}${sourceLines.length ? `\n\n──────\n${sourceLines.join("\n")}` : ""}`,
        { reply_markup: { inline_keyboard: [[{ text: "🔍 Search Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
    } catch {
      stopSearchTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
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
    const statusMsg = await bot.sendMessage(chatId, e ? "📝 Summarizing..." : "Summarizing...");
    const stopTyping = startTypingLoop(bot, chatId);
    try {
      const reply = await chat(user.userId, chatId + 5556, `Summarize the following text in clear bullet points:\n\n${summarizeText}`, { style: "serious", emoji: e, length: "short" }, user.premium.active);
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await safeSend(bot, chatId, `📝 Summary:\n\n${reply}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] } });
    } catch {
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Summarization failed. Please try again.");
    }
    return;
  }

  // ── Translate intent (natural language) ───────────────────────────────────────
  const translateMatch = detectTranslateIntent(text);
  if (translateMatch) {
    const statusMsg = await bot.sendMessage(chatId, e ? "🌐 Translating..." : "Translating...");
    const stopTyping = startTypingLoop(bot, chatId);
    try {
      const reply = await chat(user.userId, chatId + 9999, `Translate the following to ${translateMatch.targetLang}. Only respond with the translation, no explanation:\n\n"${translateMatch.content}"`, { style: "serious", emoji: false, length: "short" }, user.premium.active);
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await safeSend(bot, chatId, `🌐 ${translateMatch.targetLang} translation:\n\n${reply}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main_menu" }]] } });
    } catch {
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Translation failed. Please try again.");
    }
    return;
  }

  // ── Plain text → AI chat ─────────────────────────────────────────────────

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
  const reply = await chat(user.userId, chatId, text, user.settings, user.premium.active, user.mood ?? undefined, user.preferredChatModel ?? undefined);
  stopTyping();
  await sendAIReply(bot, chatId, reply);

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
        const statusMsg2 = await bot.sendMessage(chatId, e ? "🔍 Searching the web..." : "Searching...");
        const stopSearchTyping2 = startTypingLoop(bot, chatId);
        try {
          const results = await webSearch(input);
          const raw = formatSearchResults(input, results);
          stopSearchTyping2();
          try { await bot.deleteMessage(chatId, statusMsg2.message_id); } catch {}
          if (results.length === 0) {
            await bot.sendMessage(chatId, `No results found for: "${input}"\n\nTry rephrasing.`,
              { reply_markup: { inline_keyboard: [[{ text: "🔍 Try Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } });
            break;
          }
          const aiPrompt = `Based on these web search results for "${input}":\n\n${raw}\n\nSummarize the key findings in a helpful, natural response. Be concise and direct. Mention relevant sources.`;
          const reply = await chat(user.userId, chatId + 8888, aiPrompt, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
          const sourceLines = results.slice(0, 3).map(r => r.url).filter(Boolean);
          await safeSend(bot, chatId,
            `🔍 ${input}\n\n${reply}${sourceLines.length ? `\n\n──────\n${sourceLines.join("\n")}` : ""}`,
            { reply_markup: { inline_keyboard: [[{ text: "🔍 Search Again", callback_data: "search_again" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
          );
        } catch {
          stopSearchTyping2();
          try { await bot.deleteMessage(chatId, statusMsg2.message_id); } catch {}
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
      case "music_input": {
        await handleMusicGeneration(bot, chatId, user, input, e);
        break;
      }
      case "sticker_input": {
        await handleStickerGeneration(bot, chatId, user, input, e);
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
            "❌ That doesn't look like a valid Vercel token. Please try again from ⚙️ Settings → 🚀 Deployments.",
            { reply_markup: { inline_keyboard: [[{ text: "⬅️ Deployments", callback_data: "settings_deployments" }]] } }
          );
          break;
        }
        const encVercel = encrypt(tok);
        await User.updateOne({ userId: user.userId }, { vercelTokenEncrypted: encVercel });
        await bot.sendMessage(chatId,
          `✅ Vercel token saved securely!\n\n🔒 Encrypted with AES-256. Nova will use it when you run /deploy.\n\nTo remove it: ⚙️ Settings → 🚀 Deployments → Remove Vercel Token`,
          { reply_markup: { inline_keyboard: [[{ text: "⚙️ Deployments", callback_data: "settings_deployments" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
        );
        break;
      }
      case "render_set_token": {
        const tok = input.trim();
        try { if (messageId) await bot.deleteMessage(chatId, messageId); } catch {}
        if (!tok || tok.length < 10) {
          await bot.sendMessage(chatId,
            "❌ That doesn't look like a valid Render API key. Please try again from ⚙️ Settings → 🚀 Deployments.",
            { reply_markup: { inline_keyboard: [[{ text: "⬅️ Deployments", callback_data: "settings_deployments" }]] } }
          );
          break;
        }
        const encRender = encrypt(tok);
        await User.updateOne({ userId: user.userId }, { renderTokenEncrypted: encRender });
        await bot.sendMessage(chatId,
          `✅ Render API key saved securely!\n\n🔒 Encrypted with AES-256. Nova will use it when deploying to Render.\n\nTo remove it: ⚙️ Settings → 🚀 Deployments → Remove Render Token`,
          { reply_markup: { inline_keyboard: [[{ text: "⚙️ Deployments", callback_data: "settings_deployments" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
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

    const statusMsg = await bot.sendMessage(chatId,
      question
        ? `Analyzing your image for: "${question.slice(0, 60)}"...`
        : "Analyzing your image..."
    );
    const stopTyping = startTypingLoop(bot, chatId, "upload_photo");

    try {
      const imageBuffer = await downloadTelegramPhoto(bot, photo.file_id);
      if (!imageBuffer) {
        stopTyping();
        await bot.editMessageText("Failed to download your image. Please try again.", {
          chat_id: chatId, message_id: statusMsg.message_id,
        });
        return;
      }

      const rawAnalysis = await analyzeImage(imageBuffer, question);
      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

      if (!rawAnalysis) {
        await bot.sendMessage(chatId,
          "I couldn't analyze this image right now — the model may be warming up. Try again in a moment.",
          { reply_markup: imageMenuKeyboard() }
        );
        return;
      }

      // Enrich the raw BLIP output with a full AI response
      const enrichPrompt = question
        ? `The user asked: "${question}"\nAbout an image described as: "${rawAnalysis}"\n\nAnswer their question about the image naturally and helpfully. If the description doesn't answer it directly, say so and give what you can.`
        : `Describe this image to the user in an interesting and helpful way. The vision model identified it as: "${rawAnalysis}"\n\nExpand on this naturally, mentioning details, mood, and what stands out.`;

      const fullReply = await chat(
        user.userId, chatId + 7777, enrichPrompt,
        { style: user.settings.style, emoji: user.settings.emoji, length: "short" },
        user.premium.active
      );

      const header = question ? `🔍 Image Analysis\n\nQ: ${question}\n\n` : `🖼 Image Description\n\n`;
      await safeSend(bot, chatId, header + fullReply, { reply_markup: imageMenuKeyboard() });
    } catch (err) {
      stopTyping();
      logger.error({ err }, "Photo auto-analysis error");
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.sendMessage(chatId, "Something went wrong analyzing this image. Try again.", {
        reply_markup: imageMenuKeyboard(),
      });
    }
    return;
  }

  const photoImgLimit = await getImageLimit(user.premium.active);
  if (user.usage.images >= photoImgLimit) {
    await bot.sendMessage(chatId,
      `Daily image limit reached (${photoImgLimit >= 999999 ? "∞" : photoImgLimit}/day).` +
      (user.premium.active ? "" : " Upgrade with /redeem CODE.")
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

  const statusMsg = await bot.sendMessage(chatId, "Processing your image...");
  const stopImgTyping = startTypingLoop(bot, chatId, "upload_photo");

  try {
    const imageBuffer = await downloadTelegramPhoto(bot, photo.file_id);
    if (!imageBuffer) {
      await bot.editMessageText("Failed to download your photo. Please try again.", {
        chat_id: chatId, message_id: statusMsg.message_id,
      });
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

    stopImgTyping();
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

    if (!result) {
      await bot.sendMessage(chatId,
        "Image processing failed. The model may be loading — try again in 30 seconds.",
        { reply_markup: imageMenuKeyboard() }
      );
      return;
    }

    user.usage.images += 1;
    await user.save();
    track("image_edit", user.userId, chatId).catch(() => {});

    await bot.sendPhoto(chatId, result, {
      caption: `Done! (${pending.type.replace("img_", "").replace("_", " ")})`,
      reply_markup: imageMenuKeyboard() as any,
    });

  } catch (err) {
    stopImgTyping();
    logger.error({ err }, "Photo processing error");
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
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

  const statusMsg = await bot.sendMessage(chatId,
    `🔨 Analyzing your request...\n\n"${prompt.substring(0, 120)}${prompt.length > 120 ? "..." : ""}"\n\n` +
    `Generating a complete, working project. This takes 1-2 minutes.\n` +
    (hasGitHub ? `GitHub push will follow automatically.` : `Files will be sent to you directly.`)
  );
  const stopTyping = startTypingLoop(bot, chatId);

  // ── Step 1: Generate project files ─────────────────────────────────────────
  let project;
  try {
    project = await generateProject(prompt, apiKey);
  } catch (err: any) {
    stopTyping();
    logger.error({ err }, "Project generation failed");
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
    await bot.sendMessage(chatId,
      `❌ Generation failed: ${err.message}\n\nTry being more specific, e.g. "portfolio website for a photographer" or "todo app with dark mode".`,
      { reply_markup: buildResultKeyboard() }
    );
    return;
  }

  const label = typeLabel(project.type);
  const fileCount = project.files.length;
  const vercelTok = await resolveVercelToken(user);
  const renderTok = await resolveRenderToken(user);
  const canDeploy = !!vercelTok;
  const canDeployRender = !!renderTok;
  cacheUserBuild(user.userId, project, prompt);

  // ── Step 2a: GitHub push ────────────────────────────────────────────────────
  if (hasGitHub) {
    try {
      await bot.editMessageText(
        `✅ Code generated! (${fileCount} files — ${label})\n📤 Creating GitHub repository...`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    } catch {}

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
      stopTyping();
      logger.error({ err }, "GitHub repo creation failed");
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
      const reason =
        err?.response?.status === 401
          ? "GitHub authentication failed. Check your GITHUB_TOKEN secret."
          : err?.response?.status === 422
          ? `A repo named "${repoName}" already exists.`
          : `GitHub error: ${err?.response?.data?.message || err.message}`;
      await bot.sendMessage(chatId, `⚠️ ${reason}\n\nSending files directly instead...`);
      await sendProjectFiles(bot, chatId, project, e);
      return;
    }

    try {
      await bot.editMessageText(
        `✅ Repository created!\n📤 Uploading ${fileCount} files...`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    } catch {}

    let lastDone = 0;
    try {
      await pushAllFiles(
        githubToken!,
        githubUsername!,
        repoInfo.name,
        project.files,
        async (done, total) => {
          lastDone = done;
          try {
            await bot.editMessageText(
              `📤 Uploading files... ${done}/${total}`,
              { chat_id: chatId, message_id: statusMsg.message_id }
            );
          } catch {}
        }
      );
    } catch (err) {
      // Retry remaining files once
      logger.warn({ err, lastDone }, "Partial upload failure — retrying remaining files");
      try {
        await pushAllFiles(githubToken!, githubUsername!, repoInfo.name, project.files.slice(lastDone));
      } catch {
        stopTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        await bot.sendMessage(chatId,
          `⚠️ Uploaded ${lastDone}/${fileCount} files. Repo: ${repoInfo.htmlUrl}\n\nSending remaining files directly...`,
          { reply_markup: buildResultKeyboard(repoInfo.htmlUrl, canDeploy) }
        );
        await sendProjectFiles(bot, chatId, project, e, lastDone);
        return;
      }
    }

    stopTyping();
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

    user.usage.builds = (user.usage.builds ?? 0) + 1;
    user.projects = user.projects ?? [];
    user.projects.push({ name: project.name, repoUrl: repoInfo.htmlUrl, deployUrl: undefined, createdAt: new Date() } as any);
    await user.save();

    cacheUserBuild(user.userId, project, prompt, repoInfo.htmlUrl);

    await bot.sendMessage(chatId,
      `🚀 Your project is ready!\n\n` +
      `📦 ${project.name}\n` +
      `${project.description}\n\n` +
      `🔗 ${repoInfo.htmlUrl}\n\n` +
      `${fileCount} files · ${label}\n\n` +
      `💡 ${project.deploymentTip}`,
      { reply_markup: buildResultKeyboard(repoInfo.htmlUrl, canDeploy, canDeployRender) }
    );
    return;
  }

  // ── Step 2b: No GitHub — send files directly ────────────────────────────────
  user.usage.builds = (user.usage.builds ?? 0) + 1;
  user.projects = user.projects ?? [];
  user.projects.push({ name: project.name, repoUrl: undefined, deployUrl: undefined, createdAt: new Date() } as any);
  await user.save();

  stopTyping();
  try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

  await bot.sendMessage(chatId,
    `✅ Project generated!\n\n` +
    `📦 ${project.name}\n` +
    `${project.description}\n\n` +
    `${fileCount} files · ${label}\n\n` +
    `Sending files now 👇\n\n` +
    `💡 ${project.deploymentTip}\n\n` +
    `💡 Tip: Go to ⚙️ Settings → 🔑 GitHub to connect your GitHub account for auto-push next time.`,
    { reply_markup: buildResultKeyboard(undefined, canDeploy, canDeployRender) }
  );
  await sendProjectFiles(bot, chatId, project, e);
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
    await bot.sendMessage(chatId, `❌ Generation failed: ${err.message}`);
    return;
  }

  cacheUserBuild(user.userId, project, prompt);

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

// ── Music generation helper ───────────────────────────────────────────────────

async function handleMusicGeneration(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  prompt: string,
  e: boolean
): Promise<void> {
  if (!process.env.HUGGINGFACE_API_TOKEN) {
    await bot.sendMessage(chatId, e ? "🎵 Music generation isn't configured yet. Ask the owner to set it up!" : "Music generation is not configured yet.");
    return;
  }
  // Per-day music limit check
  const musLimCfg = await getOrCreateBotConfig();
  const musicLimit = user.premium.active ? musLimCfg.usageLimits.premiumMusic : musLimCfg.usageLimits.freeMusic;
  if (musicLimit >= 0 && (user.usage.music ?? 0) >= musicLimit) {
    await bot.sendMessage(chatId,
      `Daily music limit reached (${musicLimit}/day).` +
      (user.premium.active ? "" : " Upgrade to /premium for more music generations.")
    );
    return;
  }
  const sentMsg = await bot.sendMessage(chatId,
    e ? "🎵 Generating your music... This takes 30-90 seconds. Hang tight!" : "🎵 Generating music..."
  );
  const stopTyping = startTypingLoop(bot, chatId);
  const onStatus = async (msg: string) => {
    try { await bot.editMessageText(msg, { chat_id: chatId, message_id: sentMsg.message_id }); } catch {}
  };
  try {
    const audioBuffer = await generateMusic(prompt, onStatus);
    stopTyping();
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    if (!audioBuffer) {
      await bot.sendMessage(chatId,
        e ? "🎵 Music generation failed. The model may be warming up — try again in a minute!" : "Music generation failed. Try again in a minute.",
        { reply_markup: { inline_keyboard: [[{ text: "🎵 Try Again", callback_data: "music_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
      );
      return;
    }
    user.usage.music = (user.usage.music ?? 0) + 1;
    await user.save();
    await bot.sendAudio(chatId, audioBuffer, { title: prompt.substring(0, 60), performer: "Nova AI" });
    await bot.sendMessage(chatId,
      e ? "🎵 Here's your music! Want a different style?" : "Music generated! Want another?",
      { reply_markup: { inline_keyboard: [[{ text: "🎵 Generate Another", callback_data: "music_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
  } catch (err) {
    stopTyping();
    logger.error({ err }, "Music generation error");
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    await bot.sendMessage(chatId, e ? "🎵 Music generation failed. Please try again later." : "Music generation failed. Please try again later.",
      { reply_markup: { inline_keyboard: [[{ text: "🎵 Try Again", callback_data: "music_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] } }
    );
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
  const sentMsg = await bot.sendMessage(chatId, "🖼️ Creating your sticker image...");
  const stopTyping = startTypingLoop(bot, chatId, "upload_photo");
  try {
    const stickerPrompt = `${prompt}, sticker art style, clean white or transparent background, bold outlines, cute and expressive, high contrast, simple design`;
    const imageBuffer = await generateImage(stickerPrompt);
    stopTyping();
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    if (!imageBuffer) {
      await bot.sendMessage(chatId, "Sticker generation failed. Try again in 30 seconds.");
      return;
    }
    user.usage.images += 1;
    await user.save();
    track("image_gen", user.userId, chatId, { type: "sticker" }).catch(() => {});
    await bot.sendPhoto(chatId, imageBuffer, {
      caption: `🖼️ Sticker: ${prompt.substring(0, 80)}\n\n💡 Save this image → open Telegram Settings → Stickers → Create your own!`,
      reply_markup: { inline_keyboard: [[{ text: "🖼️ Make Another", callback_data: "sticker_generate_btn" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] },
    });
  } catch (err) {
    stopTyping();
    logger.error({ err }, "Sticker generation error");
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
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
    await user.save();
    track("image_gen", user.userId, chatId).catch(() => {});
    await bot.sendPhoto(chatId, imageBuffer, { caption: prompt });
  } catch (err) {
    stopImgTyping();
    logger.error({ err }, "Image generation error");
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    await bot.sendMessage(chatId, "Image generation failed. Please try again.");
  }
}
