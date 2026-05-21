import TelegramBot from "node-telegram-bot-api";
import { IUser, User } from "../models/User.js";
import { RedeemCode } from "../models/RedeemCode.js";
import { chat, clearMemory } from "../services/ai.js";
import { generateImage, getImageLimit, editImage, downloadTelegramPhoto } from "../services/image.js";
import { isRateLimited } from "../utils/rateLimiter.js";
import { formatDate, addDays, getUserName, safeSend } from "../utils/helpers.js";
import { parseDuration } from "../models/RedeemCode.js";
import { getPending, clearPending, setPending, PHOTO_ACTIONS } from "../utils/pendingActions.js";
import {
  mainMenuKeyboard,
  funMenuKeyboard,
  gamesMenuKeyboard,
  aiMenuKeyboard,
  imageMenuKeyboard,
  backToMainKeyboard,
} from "../utils/keyboards.js";
import { logger } from "../../lib/logger.js";

export async function handlePrivateMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  maintenanceMode: boolean
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (user.banned) {
    await bot.sendMessage(chatId, "You have been banned from using Nova.");
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

  // ── Check pending text action from button-triggered flows ─────────────────
  const pendingAction = getPending(user.userId);
  if (pendingAction && !PHOTO_ACTIONS.has(pendingAction.type) && !text.startsWith("/")) {
    clearPending(user.userId);
    await handlePendingText(bot, chatId, user, pendingAction.type, text, e, pendingAction.data);
    return;
  }

  // /start — show interactive dashboard
  if (text === "/start" || text.startsWith("/start ")) {
    await bot.sendMessage(chatId,
      `Hey ${name}! I'm Nova, your AI assistant.\n\nPick what you'd like to do:`,
      { reply_markup: mainMenuKeyboard() }
    );
    return;
  }

  // /help
  if (text === "/help") {
    const badge = user.premium.active ? " (Premium)" : "";
    await bot.sendMessage(chatId,
      `Nova Commands${badge}\n\n` +
      `Chat:\n` +
      `Just type anything to chat with Nova!\n` +
      `/ask <question> — Quick answer (no memory saved)\n` +
      `/forget — Clear conversation memory\n\n` +
      `Images:\n` +
      `/image <prompt> — Generate an image\n\n` +
      `Utilities:\n` +
      `/translate <text> — Translate text to English\n` +
      `/summarize — Summarize our conversation\n` +
      `/quote — Get an inspiring quote\n` +
      `/fact — Random fun fact\n` +
      `/tip — Productivity tip\n` +
      `/mood <mood> — Set your mood (happy/sad/stressed/bored/excited)\n` +
      `/feedback <message> — Send feedback to the owner\n\n` +
      `Settings:\n` +
      `/profile — Your profile\n` +
      `/settings — Your settings\n` +
      `/lang <en|ar|fr|es> — Set language\n` +
      `/style friendly|funny|serious|balanced\n` +
      `/length long|short\n` +
      `/emoji on|off\n\n` +
      `Premium:\n` +
      `/premium — Premium status\n` +
      `/redeem <code> — Redeem a code`
    );
    return;
  }

  // /profile
  if (text === "/profile") {
    const premiumLine = user.premium.active
      ? `Premium — expires ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}`
      : "Free";
    await bot.sendMessage(chatId,
      `Your Profile\n\n` +
      `Name: ${name}\n` +
      `ID: ${user.userId}\n` +
      `Username: ${user.username ? "@" + user.username : "N/A"}\n` +
      `Status: ${premiumLine}\n` +
      `Style: ${user.settings.style}\n` +
      `Language: ${user.settings.language || "en"}\n` +
      `Mood: ${user.mood || "Not set"}\n` +
      `Emojis: ${user.settings.emoji ? "On" : "Off"}\n` +
      `Reply length: ${user.settings.length}\n` +
      `Warnings: ${user.warnings}\n` +
      `First seen: ${formatDate(user.firstSeen)}\n` +
      `Messages today: ${user.usage.messages}\n` +
      `Images today: ${user.usage.images}/${getImageLimit(user.premium.active)}`
    );
    return;
  }

  // /settings
  if (text === "/settings") {
    await bot.sendMessage(chatId,
      `Your Settings\n\n` +
      `Style: ${user.settings.style}\n` +
      `Language: ${user.settings.language || "en"}\n` +
      `Emojis: ${user.settings.emoji ? "On" : "Off"}\n` +
      `Reply length: ${user.settings.length}\n\n` +
      `Change with:\n` +
      `/style friendly | funny | serious | balanced\n` +
      `/lang en | ar | fr | es\n` +
      `/emoji on | off\n` +
      `/length long | short`
    );
    return;
  }

  // /premium
  if (text === "/premium") {
    if (user.premium.active) {
      await bot.sendMessage(chatId,
        `You are a Premium member!\n\n` +
        `Expires: ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}\n\n` +
        `Perks:\n` +
        `- ${getImageLimit(true)} images per day\n` +
        `- Longer AI context\n` +
        `- Richer responses`
      );
    } else {
      await bot.sendMessage(chatId,
        `You are on the Free plan.\n\n` +
        `Limits:\n` +
        `- ${getImageLimit(false)} images per day\n` +
        `- Standard AI\n\n` +
        `Upgrade with a redeem code: /redeem CODE`
      );
    }
    return;
  }

  // /forget
  if (text === "/forget") {
    await clearMemory(user.userId, chatId);
    await bot.sendMessage(chatId,
      e ? "Memory cleared! I have forgotten our previous conversations. Fresh start!" : "Memory cleared. Starting fresh."
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
      await bot.sendMessage(chatId, `Valid moods: ${validMoods.join(", ")}\n\nExample: /mood happy`);
      return;
    }
    user.mood = chosen;
    await user.save();
    const moodResponses: Record<string, string> = {
      happy: "That is great! I love seeing you in a good mood!",
      sad: "I am sorry to hear that. I am here for you whenever you need to talk.",
      stressed: "Take a deep breath. I am here to help however I can.",
      bored: "Let's fix that! Ask me anything or request an image.",
      excited: "Your excitement is contagious! What are we talking about?",
      angry: "I hear you. Talking it out can help. What is on your mind?",
      anxious: "It is okay. I am here. We can take it slow.",
      tired: "Rest is important. I will keep my answers concise for now.",
      motivated: "Let's make the most of it! What are we working on?",
      neutral: "All good. I am here whenever you need me.",
    };
    await bot.sendMessage(chatId, `Mood set to: ${chosen}.\n\n${moodResponses[chosen] || ""}`);
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
    await bot.sendChatAction(chatId, "typing");
    const translationPrompt = `Translate the following text to English. Only respond with the translation, nothing else:\n\n"${toTranslate}"`;
    const reply = await chat(user.userId, chatId + 9999, translationPrompt, { style: "serious", emoji: false, length: "short" }, user.premium.active);
    await bot.sendMessage(chatId, `Translation:\n${reply}`);
    return;
  }

  // /summarize — summarize our conversation
  if (text === "/summarize") {
    await bot.sendChatAction(chatId, "typing");
    const summarizePrompt = "Please summarize our conversation so far in 3-5 bullet points. Be concise.";
    const reply = await chat(user.userId, chatId, summarizePrompt, { style: "serious", emoji: false, length: "short" }, user.premium.active);
    await bot.sendMessage(chatId, `Conversation Summary:\n\n${reply}`);
    return;
  }

  // /quote
  if (text === "/quote") {
    await bot.sendChatAction(chatId, "typing");
    const reply = await chat(user.userId, chatId + 1111, "Give me one inspiring or thought-provoking quote. Format: Quote — Author", { style: "friendly", emoji: e, length: "short" }, user.premium.active);
    await bot.sendMessage(chatId, e ? `"${reply}"` : reply);
    return;
  }

  // /fact
  if (text === "/fact") {
    await bot.sendChatAction(chatId, "typing");
    const reply = await chat(user.userId, chatId + 2222, "Tell me one surprising, interesting, and true fact. Keep it to 2-3 sentences.", { style: "funny", emoji: e, length: "short" }, user.premium.active);
    await bot.sendMessage(chatId, e ? `Did you know?\n\n${reply}` : `Did you know?\n\n${reply}`);
    return;
  }

  // /tip
  if (text === "/tip") {
    await bot.sendChatAction(chatId, "typing");
    const reply = await chat(user.userId, chatId + 3333, "Give me one actionable productivity, health, or life improvement tip. Be specific and practical. 2-3 sentences.", { style: "balanced", emoji: e, length: "short" }, user.premium.active);
    await bot.sendMessage(chatId, e ? `Tip of the moment:\n\n${reply}` : `Tip:\n\n${reply}`);
    return;
  }

  // /ask <question> — quick AI answer without saving to memory
  if (text.startsWith("/ask")) {
    const question = text.replace(/^\/ask\s*/i, "").trim();
    if (!question) { await bot.sendMessage(chatId, "Usage: /ask <question>"); return; }
    await bot.sendChatAction(chatId, "typing");
    // Use a unique chat ID so it doesn't affect the main conversation memory
    const reply = await chat(user.userId, chatId + 5555, question, { style: user.settings.style, emoji: e, length: "short" }, user.premium.active);
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
        await bot.sendMessage(chatId, "Thank you! Your feedback has been sent to the Nova team.");
      } catch {
        await bot.sendMessage(chatId, "Could not send feedback right now. Please try again later.");
      }
    } else {
      await bot.sendMessage(chatId, "Feedback system is not configured yet.");
    }
    return;
  }

  // Ignore unknown slash commands
  if (text.startsWith("/")) return;

  // ── Plain text → AI chat ─────────────────────────────────────────────────

  user.usage.messages += 1;
  await user.save();
  await bot.sendChatAction(chatId, "typing");

  const reply = await chat(user.userId, chatId, text, user.settings, user.premium.active, user.mood ?? undefined);
  await safeSend(bot, chatId, reply);
}

// ── Pending text action handler (for button-triggered multi-step flows) ────────

async function handlePendingText(
  bot: TelegramBot,
  chatId: number,
  user: IUser,
  actionType: string,
  input: string,
  e: boolean,
  pendingData?: Record<string, string>
): Promise<void> {
  await bot.sendChatAction(chatId, "typing");
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
      default:
        await bot.sendMessage(chatId, "Something went wrong. Try again from the menu.", { reply_markup: mainMenuKeyboard() });
    }
  } catch (err) {
    logger.error({ err, actionType }, "Error handling pending text action");
    await bot.sendMessage(chatId, "Something went wrong, try again later.", { reply_markup: mainMenuKeyboard() });
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
    await bot.sendMessage(chatId,
      "Select an image tool from the menu first, then send your photo:",
      { reply_markup: imageMenuKeyboard() }
    );
    return;
  }

  if (user.usage.images >= getImageLimit(user.premium.active)) {
    await bot.sendMessage(chatId,
      `Daily image limit reached (${getImageLimit(user.premium.active)}/day).` +
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
  await bot.sendChatAction(chatId, "upload_photo");

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

    await bot.sendPhoto(chatId, result, {
      caption: `Done! (${pending.type.replace("img_", "").replace("_", " ")})`,
      reply_markup: imageMenuKeyboard() as any,
    });

  } catch (err) {
    logger.error({ err }, "Photo processing error");
    try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
    await bot.sendMessage(chatId, "Something went wrong. Try again later.", {
      reply_markup: imageMenuKeyboard(),
    });
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
  const limit = getImageLimit(isPrem);

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

  try {
    const imageBuffer = await generateImage(prompt);
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}

    if (!imageBuffer) {
      await bot.sendMessage(chatId, "Image generation failed. The model may be warming up — try again in 30 seconds.");
      return;
    }

    user.usage.images += 1;
    await user.save();
    await bot.sendPhoto(chatId, imageBuffer, { caption: prompt });
  } catch (err) {
    logger.error({ err }, "Image generation error");
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}
    await bot.sendMessage(chatId, "Image generation failed. Please try again.");
  }
}
