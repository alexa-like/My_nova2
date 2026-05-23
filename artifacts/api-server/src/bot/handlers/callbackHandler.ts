import TelegramBot from "node-telegram-bot-api";
import { User } from "../models/User.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { chat, clearMemory } from "../services/ai.js";
import { formatDate, startTypingLoop, addDays } from "../utils/helpers.js";
import { getImageLimit } from "../services/image.js";
import { setPending } from "../utils/pendingActions.js";
import { listUserReminders, cancelReminder } from "../services/reminder.js";
import { getOrCreateBotConfig, invalidateBotConfigCache } from "../models/BotConfig.js";
import { sendOwnerPanel } from "./ownerHandler.js";
import { getMaintenance, setMaintenance } from "../utils/maintenanceState.js";
import { analyzeImage } from "../services/imageAnalysis.js";
import { getCachedBuild } from "../utils/buildCache.js";
import { deployToVercel, deployToRender } from "../services/deploy.js";
import { decrypt } from "../utils/crypto.js";
import { typeLabel } from "../services/projectGenerator.js";
import {
  createGitHubRepo,
  pushAllFiles,
  repoExists,
  sanitizeRepoName,
  uniqueRepoName,
} from "../services/github.js";
import {
  mainMenuKeyboard,
  funMenuKeyboard,
  gamesMenuKeyboard,
  writeMenuKeyboard,
  aiMenuKeyboard,
  imageMenuKeyboard,
  imgStyleKeyboard,
  moodPickerKeyboard,
  settingsMenuKeyboard,
  styleMenuKeyboard,
  lengthMenuKeyboard,
  langMenuKeyboard,
  backToMainKeyboard,
  backToSettingsKeyboard,
  backToFunKeyboard,
  backToAiKeyboard,
  backToImgKeyboard,
  triviaKeyboard,
  wyrKeyboard,
  repeatKeyboard,
  ownerUsersKeyboard,
  ownerPremiumKeyboard,
  ownerCodesKeyboard,
  ownerBroadcastKeyboard,
  ownerGroupsKeyboard,
  ownerChatModelsKeyboard,
  ownerImageModelsKeyboard,
  ownerUserListKeyboard,
  backToOwnerKeyboard,
  githubSettingsKeyboard,
  deploymentsKeyboard,
  projectsListKeyboard,
  ownerProvidersKeyboard,
  ownerFeaturesKeyboard,
  ownerChatProvidersKeyboard,
  ownerPickChatProviderKeyboard,
  ownerPickOpenRouterModelKeyboard,
  ownerImageProvidersKeyboard,
  ownerPickImageProviderKeyboard,
  ownerTtsKeyboard,
  ownerPickTtsVoiceKeyboard,
  modeSelectKeyboard,
  currentModeKeyboard,
  accountMenuKeyboard,
  creditsMenuKeyboard,
  referralKeyboard,
  insufficientCreditsKeyboard,
} from "../utils/keyboards.js";
import { getUserMode, setUserMode, MODES, getModeById, isValidMode } from "../services/modeManager.js";
import { logger } from "../../lib/logger.js";
import { addCredits, getCredits } from "../services/credits.js";
import { hasAnyPaymentProvider } from "../services/payment.js";

// ── Trivia questions ──────────────────────────────────────────────────────────

const TRIVIA = [
  { q: "What planet is known as the Red Planet?", opts: ["Venus", "Mars", "Jupiter", "Saturn"], ans: 1 },
  { q: "How many sides does a hexagon have?", opts: ["5", "6", "7", "8"], ans: 1 },
  { q: "What is the largest ocean on Earth?", opts: ["Atlantic", "Indian", "Arctic", "Pacific"], ans: 3 },
  { q: "Who painted the Mona Lisa?", opts: ["Van Gogh", "Picasso", "Da Vinci", "Rembrandt"], ans: 2 },
  { q: "What is the capital of Japan?", opts: ["Osaka", "Kyoto", "Tokyo", "Seoul"], ans: 2 },
  { q: "How many bones are in the adult human body?", opts: ["106", "206", "306", "406"], ans: 1 },
  { q: "What is the fastest land animal?", opts: ["Lion", "Horse", "Cheetah", "Leopard"], ans: 2 },
  { q: "In what year did World War 2 end?", opts: ["1943", "1944", "1945", "1946"], ans: 2 },
  { q: "What does H2O stand for?", opts: ["Hydrogen only", "Oxygen only", "Water", "Carbon dioxide"], ans: 2 },
  { q: "How many continents are on Earth?", opts: ["5", "6", "7", "8"], ans: 2 },
  { q: "What is the smallest planet in our solar system?", opts: ["Mars", "Venus", "Mercury", "Pluto"], ans: 2 },
  { q: "Who wrote Romeo and Juliet?", opts: ["Charles Dickens", "Shakespeare", "Homer", "Tolstoy"], ans: 1 },
  { q: "What is the chemical symbol for gold?", opts: ["Go", "Gd", "Au", "Ag"], ans: 2 },
  { q: "Which country invented pizza?", opts: ["Greece", "France", "Spain", "Italy"], ans: 3 },
  { q: "How many colors are in a rainbow?", opts: ["5", "6", "7", "8"], ans: 2 },
  { q: "What is the capital of Australia?", opts: ["Sydney", "Melbourne", "Canberra", "Brisbane"], ans: 2 },
  { q: "How many players are on a soccer team?", opts: ["9", "10", "11", "12"], ans: 2 },
  { q: "What language has the most native speakers?", opts: ["English", "Spanish", "Mandarin", "Hindi"], ans: 2 },
  { q: "What is the hardest natural substance on Earth?", opts: ["Gold", "Iron", "Diamond", "Platinum"], ans: 2 },
  { q: "Which planet has the most moons?", opts: ["Jupiter", "Saturn", "Uranus", "Neptune"], ans: 1 },
];

// ── Would You Rather questions ────────────────────────────────────────────────

const WYR = [
  { a: "be able to fly", b: "be invisible whenever you want" },
  { a: "always know when someone is lying", b: "get away with any lie you tell" },
  { a: "speak every language fluently", b: "play every instrument perfectly" },
  { a: "be incredibly smart", b: "be incredibly attractive" },
  { a: "never feel pain", b: "never feel sad" },
  { a: "live without music", b: "live without social media" },
  { a: "have unlimited money but no friends", b: "have great friends but always be broke" },
  { a: "be famous for something embarrassing", b: "be unknown but very successful" },
  { a: "read minds but can't turn it off", b: "see 5 minutes into the future, once a day" },
  { a: "always be 10 minutes late", b: "always be 20 minutes early" },
  { a: "eat the same meal every day forever", b: "never eat your favorite food again" },
  { a: "lose all your photos", b: "lose all memories of the last 3 years" },
  { a: "be able to control time", b: "be able to control minds" },
  { a: "live in the past (your choice of era)", b: "live in the future 100 years ahead" },
  { a: "have a photographic memory", b: "be able to forget anything on command" },
  { a: "only be able to whisper", b: "only be able to shout" },
  { a: "never need to sleep", b: "never need to eat" },
  { a: "know how you will die", b: "know when you will die" },
  { a: "fight 100 duck-sized horses", b: "fight 1 horse-sized duck" },
  { a: "travel back in time but never return", b: "see the future but never change it" },
  { a: "always speak your mind", b: "always know what others are thinking" },
  { a: "have no internet for a year", b: "have no friends for a year" },
  { a: "be the funniest person in any room", b: "be the smartest person in any room" },
  { a: "never use a phone again", b: "never travel again" },
  { a: "have one real superpower", b: "be the most talented human alive" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function editMsg(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery,
  text: string,
  reply_markup?: TelegramBot.InlineKeyboardMarkup,
  parse_mode?: "HTML" | "Markdown"
): Promise<void> {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup,
      ...(parse_mode ? { parse_mode } : {}),
    });
  } catch {
    // Message may be identical — not an error
  }
}

async function answer(bot: TelegramBot, queryId: string, text?: string): Promise<void> {
  try { await bot.answerCallbackQuery(queryId, text ? { text, show_alert: false } : {}); } catch {}
}

function getUserId(query: TelegramBot.CallbackQuery): number {
  return query.from.id;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleCallbackQuery(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  if (!query.message || !query.data) { await answer(bot, query.id); return; }

  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = getUserId(query);

  await answer(bot, query.id);

  try {
    const user = await User.findOne({ userId });
    if (!user) return;

    const e = user.settings.emoji;
    const name = user.firstName || user.username || "you";

    // ── Navigation ─────────────────────────────────────────────────────────

    if (data === "main_menu" || data === "back_main") {
      const currentMode = await getUserMode(userId);
      await editMsg(bot, query,
        `Hey ${name}! What would you like to do?\n\nPick a category below:`,
        mainMenuKeyboard(currentMode.id)
      );
      return;
    }

    if (data === "fun_menu") {
      await editMsg(bot, query,
        `Fun Zone 🎉\n\nPick something fun — I dare you:`,
        funMenuKeyboard()
      );
      return;
    }

    if (data === "games_menu") {
      await editMsg(bot, query,
        `Game Room 🎮\n\nChallenge yourself:`,
        gamesMenuKeyboard()
      );
      return;
    }

    if (data === "ai_menu") {
      await editMsg(bot, query,
        `AI Tools 🤖\n\nWhat do you need?`,
        aiMenuKeyboard()
      );
      return;
    }

    if (data === "img_menu") {
      await editMsg(bot, query,
        `Image Tools 🎨\n\nGenerate or transform images.\nFor editing tools — select one, then send me a photo.`,
        imageMenuKeyboard()
      );
      return;
    }

    if (data === "settings_menu") {
      const freshUser = await User.findOne({ userId });
      if (!freshUser) return;
      await editMsg(bot, query,
        `Settings ⚙️\n\nStyle: ${freshUser.settings.style}  |  Lang: ${freshUser.settings.language || "en"}  |  Emojis: ${freshUser.settings.emoji ? "On" : "Off"}\nMood: ${freshUser.mood || "not set"}  |  Length: ${freshUser.settings.length}`,
        settingsMenuKeyboard(freshUser)
      );
      return;
    }

    if (data === "show_help") {
      const badge = user.premium.active ? " ✨ Premium" : "";
      const currentMode = await getUserMode(userId);
      await editMsg(bot, query,
        `Nova Help${badge}\n\n` +
        `Just type anything to chat with me!\n\n` +
        `Key Commands:\n` +
        `/image <prompt> — Generate an image\n` +
        `/sticker <prompt> — Create a sticker\n` +
        `/voice <text> — Text-to-speech\n` +
        `/search <query> — Web search\n` +
        `/build <idea> — Build a website or app\n` +
        `/mode — Switch interaction mode\n` +
        `/remind <time> <msg> — Set a reminder\n` +
        `/translate <text> — Translate text\n` +
        `/forget — Clear memory\n` +
        `/redeem <code> — Redeem premium code\n\n` +
        `Or use the menu below — no commands needed!`,
        mainMenuKeyboard(currentMode.id)
      );
      return;
    }

    // ── Fun Module ─────────────────────────────────────────────────────────

    if (data === "fun_joke") {
      await editMsg(bot, query, "Cooking up something funny... 🍳");
      const joke = await chat(userId, chatId + 7001, "Tell me one short, clever, clean joke. Just the joke — no intro, no explanation.", { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `😂 Joke\n\n${joke}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_8ball") {
      setPending(userId, "fun_8ball");
      await editMsg(bot, query,
        `🎱 Magic 8-Ball\n\nAsk me any yes/no question and I'll consult the universe... 🌌`,
        backToFunKeyboard()
      );
      return;
    }

    if (data === "fun_ship") {
      setPending(userId, "fun_ship");
      await editMsg(bot, query,
        `💘 Compatibility Ship\n\nSend two names separated by a space:\n\nExample: Alex Jordan`,
        backToFunKeyboard()
      );
      return;
    }

    if (data === "fun_roast") {
      setPending(userId, "fun_roast_name");
      await editMsg(bot, query,
        `🔥 Roast Generator\n\nType a name (yours or anyone's) and I'll roast them — all in good fun, no harm intended 😈`,
        backToFunKeyboard()
      );
      return;
    }

    if (data === "fun_iq") {
      await editMsg(bot, query, "🧠 Calculating your genius level...");
      const iqPrompt = `Give ${name} a funny, creative, fictional IQ test result. Make up a score between 60 and 160 and give a humorous personality description. Keep it light and playful, 3-4 sentences.`;
      const result = await chat(userId, chatId + 7002, iqPrompt, { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `🧠 IQ Test Results\n\n${result}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_compliment") {
      await editMsg(bot, query, "✨ Preparing something special just for you...");
      const prompt = `Give ${name} a genuinely warm, specific, and uplifting compliment. Make it feel personal and real — not generic. 2-3 sentences.`;
      const result = await chat(userId, chatId + 8001, prompt, { style: "friendly", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `🌟 Just for You\n\n${result}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_fortune") {
      await editMsg(bot, query, "🔮 Gazing into the crystal ball...");
      const prompt = `Tell ${name} a mystical, dramatic, slightly cryptic fortune reading. Reference their energy, upcoming choices, and a surprise twist. Make it feel magical and real. 4-5 sentences.`;
      const result = await chat(userId, chatId + 8002, prompt, { style: "friendly", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `🔮 Your Fortune\n\n${result}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_dare") {
      await editMsg(bot, query, "😈 Picking your dare...");
      const prompt = `Give ${name} a fun, safe, creative dare they can do alone or with friends. Nothing embarrassing, harmful, or illegal. Just playful and amusing. Keep it to 1-2 sentences.`;
      const result = await chat(userId, chatId + 8003, prompt, { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `😈 Your Dare\n\n${result}\n\nDo you accept? 😏`, funMenuKeyboard());
      return;
    }

    if (data === "fun_vibe") {
      await editMsg(bot, query, "✨ Reading your energy...");
      const prompt = `Do a playful vibe check on ${name}. Based on nothing but vibes, describe their energy, aura color, spirit animal, and give them a vibe score out of 10. Make it fun and dramatic. 4-5 sentences.`;
      const result = await chat(userId, chatId + 8004, prompt, { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `✨ Vibe Check Results\n\n${result}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_truth") {
      await editMsg(bot, query, "💭 Coming up with a deep one...");
      const prompt = `Ask ${name} one deep, thought-provoking "truth" question — the kind asked in a late-night honest conversation. Something philosophical, personal, or revealing. Just the question. Make it really good.`;
      const result = await chat(userId, chatId + 8005, prompt, { style: "balanced", emoji: e, length: "short" }, user.premium.active);
      setPending(userId, "fun_truth_reply");
      await editMsg(bot, query, `💭 Truth Question for You\n\n${result}\n\nTake your time and reply whenever you're ready... 👀`, backToFunKeyboard());
      return;
    }

    // ── Games Module ───────────────────────────────────────────────────────

    if (data === "fun_game") {
      const idx = Math.floor(Math.random() * TRIVIA.length);
      const q = TRIVIA[idx];
      await editMsg(bot, query,
        `🎯 Trivia Time!\n\nQuestion:\n${q.q}`,
        triviaKeyboard(idx, q.opts, q.ans)
      );
      return;
    }

    if (data.startsWith("game_q")) {
      const match = data.match(/^game_q(\d+)_pick(\d+)_ans(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]);
        const picked = parseInt(match[2]);
        const correct = parseInt(match[3]);
        const q = TRIVIA[idx];
        const labels = ["A", "B", "C", "D"];
        if (picked === correct) {
          await editMsg(bot, query,
            `🎯 Trivia\n\n✅ Correct! Nailed it!\n\nQ: ${q.q}\nA: ${labels[correct]}. ${q.opts[correct]}`,
            gamesMenuKeyboard()
          );
        } else {
          await editMsg(bot, query,
            `🎯 Trivia\n\n❌ Not quite!\n\nQ: ${q.q}\nRight answer: ${labels[correct]}. ${q.opts[correct]}\nYou picked: ${labels[picked]}. ${q.opts[picked]}`,
            gamesMenuKeyboard()
          );
        }
      }
      return;
    }

    if (data === "fun_wyr") {
      const idx = Math.floor(Math.random() * WYR.length);
      const q = WYR[idx];
      await editMsg(bot, query,
        `🤔 Would You Rather...\n\n🅰️  ${q.a}\n\n— OR —\n\n🅱️  ${q.b}\n\nWhich one are you picking?`,
        wyrKeyboard(idx)
      );
      return;
    }

    if (data.startsWith("wyr_a_") || data.startsWith("wyr_b_")) {
      const picked = data.startsWith("wyr_a_") ? "a" : "b";
      const idxStr = data.replace("wyr_a_", "").replace("wyr_b_", "");
      const idx = parseInt(idxStr);
      const q = WYR[idx] ?? WYR[0];
      const chosen = picked === "a" ? q.a : q.b;
      const pct = 45 + Math.floor(Math.random() * 30);
      const otherPct = 100 - pct;
      const myPct = picked === "a" ? pct : otherPct;
      const majorityPick = myPct >= 50;
      await editMsg(bot, query,
        `🤔 Would You Rather\n\n${picked === "a" ? "🅰️" : "🅱️"} You chose: ${chosen}\n\n📊 How others voted:\n🅰️ ${pct}% — ${q.a}\n🅱️ ${otherPct}% — ${q.b}\n\n${majorityPick ? "You're with the majority! 🙌" : "Brave minority pick... 👀 interesting choice."}`,
        wyrKeyboard(idx)
      );
      return;
    }

    if (data === "fun_word") {
      await editMsg(bot, query, "📖 Looking up something interesting...");
      const prompt = `Give me a fascinating, obscure, or beautiful word (from any language) that most people don't know. Format:\n\nWord: [word]\nOrigin: [language/origin]\nMeaning: [clear definition]\nExample: [one sentence using it]\n\nMake it genuinely interesting.`;
      const result = await chat(userId, chatId + 8006, prompt, { style: "balanced", emoji: false, length: "short" }, user.premium.active);
      await editMsg(bot, query, `📖 Word of the Day\n\n${result}`, gamesMenuKeyboard());
      return;
    }

    if (data === "fun_fact_game") {
      await editMsg(bot, query, "🎲 Digging through the archives of reality...");
      const prompt = `Tell me one genuinely mind-blowing, true, verifiable fact that most people don't know. Start directly with the fact. 2-3 sentences max.`;
      const result = await chat(userId, chatId + 8007, prompt, { style: "balanced", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `🎲 Mind-Blowing Fact\n\n${result}`, gamesMenuKeyboard());
      return;
    }

    // ── AI Module ─────────────────────────────────────────────────────────

    if (data === "ai_ask") {
      setPending(userId, "ai_ask");
      await editMsg(bot, query,
        `💬 Ask AI\n\nType your question — anything at all:`,
        backToAiKeyboard()
      );
      return;
    }

    if (data === "forget_memory") {
      await clearMemory(userId, query.message!.chat.id);
      await editMsg(bot, query,
        `🧹 Memory cleared! I've forgotten our conversation history. Fresh start.`,
        backToMainKeyboard()
      );
      return;
    }

    if (data === "list_reminders") {
      const reminders = await listUserReminders(userId);
      if (reminders.length === 0) {
        await editMsg(bot, query,
          `📋 No upcoming reminders.\n\nSet one with: /remind 30m Your message`,
          backToMainKeyboard()
        );
        return;
      }
      const lines = reminders.map((r: any, i: number) => {
        const id = r._id.toString().slice(-6);
        return `${i + 1}. ⏰ ${formatDate(r.triggerAt)}\n   "${r.message.substring(0, 60)}"\n   ID: ${id}`;
      });
      await editMsg(bot, query,
        `📋 Your Reminders (${reminders.length})\n\n${lines.join("\n\n")}\n\nCancel: /remind cancel <ID>`,
        backToMainKeyboard()
      );
      return;
    }

    if (data === "ai_summarize") {
      setPending(userId, "ai_summarize_input");
      await editMsg(bot, query,
        `📝 Summarize Text\n\nPaste the text you want summarized:`,
        backToAiKeyboard()
      );
      return;
    }

    if (data === "ai_translate") {
      setPending(userId, "ai_translate");
      await editMsg(bot, query,
        `🌍 Translate\n\nType or paste the text you want translated to English:`,
        backToAiKeyboard()
      );
      return;
    }

    if (data === "ai_generate") {
      setPending(userId, "ai_generate");
      await editMsg(bot, query,
        `✍️ Generate Text\n\nDescribe what you want written:\nExample: a short poem about the sea, a product description for headphones`,
        backToAiKeyboard()
      );
      return;
    }

    if (data === "ai_write") {
      await editMsg(bot, query,
        `✍️ Write for Me\n\nPick a format — then tell me the topic or what you need:`,
        writeMenuKeyboard()
      );
      return;
    }

    if (data === "write_tweet") {
      setPending(userId, "write_tweet");
      await editMsg(bot, query, `🐦 Tweet\n\nWhat's the topic or message? I'll write something punchy and viral-worthy:`, backToAiKeyboard());
      return;
    }

    if (data === "write_caption") {
      setPending(userId, "write_caption");
      await editMsg(bot, query, `📸 Instagram Caption\n\nDescribe the photo or vibe — I'll write a caption with hashtags:`, backToAiKeyboard());
      return;
    }

    if (data === "write_bio") {
      setPending(userId, "write_bio");
      await editMsg(bot, query, `👤 Bio\n\nTell me about yourself or the persona — I'll craft a standout bio:`, backToAiKeyboard());
      return;
    }

    if (data === "write_lyrics") {
      setPending(userId, "write_lyrics");
      await editMsg(bot, query, `🎵 Song Lyrics\n\nWhat's the theme, mood, or story? I'll write a verse and chorus:`, backToAiKeyboard());
      return;
    }

    if (data === "write_email") {
      setPending(userId, "write_email");
      await editMsg(bot, query, `📧 Email\n\nDescribe the situation — who it's to, tone, and what you need to say:`, backToAiKeyboard());
      return;
    }

    if (data === "write_poem") {
      setPending(userId, "write_poem");
      await editMsg(bot, query, `🎭 Poem\n\nWhat's it about? Give me a theme, feeling, or subject:`, backToAiKeyboard());
      return;
    }

    if (data === "ai_debate") {
      setPending(userId, "ai_debate");
      await editMsg(bot, query,
        `🗣️ Debate Me\n\nPick any topic — I'll argue BOTH sides and let you decide who wins:\n\nExample: "social media", "AI replacing jobs", "pineapple on pizza"`,
        backToAiKeyboard()
      );
      return;
    }

    if (data === "ai_analyze") {
      setPending(userId, "ai_analyze");
      await editMsg(bot, query,
        `🔬 Analyze Text\n\nPaste any text — I'll break down the tone, emotion, intent, and writing style:`,
        backToAiKeyboard()
      );
      return;
    }

    // ── Image Module ──────────────────────────────────────────────────────

    if (data === "img_generate") {
      setPending(userId, "img_generate_text");
      await editMsg(bot, query,
        `✨ Generate Image\n\nDescribe what you want to see:\nExample: a futuristic city at sunset, a wolf howling at the moon`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "img_styles") {
      await editMsg(bot, query,
        `🎨 Style Presets\n\nPick a visual style — then I'll ask what to draw in it:`,
        imgStyleKeyboard()
      );
      return;
    }

    if (data.startsWith("img_style_")) {
      const preset = data.replace("img_style_", "");
      const labels: Record<string, string> = {
        anime: "🎌 Anime", cyberpunk: "🤖 Cyberpunk", fantasy: "🌌 Fantasy",
        realistic: "📸 Realistic", oil: "🎨 Oil Painting", watercolor: "💧 Watercolor",
        sketch: "✏️ Sketch", pixel: "👾 Pixel Art",
      };
      const label = labels[preset] || preset;
      setPending(userId, "img_generate_text", { preset });
      await editMsg(bot, query,
        `${label} style locked in! 🔒\n\nNow describe what you want to see:\nExample: a dragon flying over mountains`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "img_edit") {
      setPending(userId, "img_edit");
      await editMsg(bot, query,
        `✏️ Edit Image\n\nSend me a photo with a caption describing what to change.\nExample caption: make the sky purple, add snow`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "img_enhance") {
      setPending(userId, "img_enhance");
      await editMsg(bot, query,
        `🔆 Enhance Image\n\nSend me a photo and I'll create a sharper, higher-quality version:`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "img_stylize") {
      setPending(userId, "img_stylize");
      await editMsg(bot, query,
        `🎭 Stylize Image\n\nSend me a photo with a caption describing the style.\nExample caption: anime, oil painting, cyberpunk neon`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "img_restore") {
      setPending(userId, "img_restore");
      await editMsg(bot, query,
        `🔧 Restore Image\n\nSend me an old or damaged photo — I'll generate a clean, sharp version:`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "sticker_btn") {
      setPending(userId, "sticker_input");
      await editMsg(bot, query,
        `🖼️ Create Sticker\n\nDescribe what you want as a sticker:\n\n• happy cat waving\n• cute anime girl with stars\n• fire dragon emoji style\n• robot dancing`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "tts_btn") {
      setPending(userId, "voice_tts_input");
      await editMsg(bot, query,
        `🔊 Text-to-Speech\n\nType the text you want me to speak:\n\nTip: keep it under 300 characters for best results.`,
        backToImgKeyboard()
      );
      return;
    }

    if (data === "sticker_generate_btn") {
      setPending(userId, "sticker_input");
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId,
        `🖼️ Describe your next sticker:\n\n• laughing panda\n• cool robot with sunglasses\n• magical unicorn emoji`,
        { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
      );
      return;
    }

    if (data === "deploy_live") {
      // Resolve Vercel token: user's saved token > env var
      let vercelToken = process.env.VERCEL_TOKEN;
      try {
        const fresh = await User.findOne({ userId }).select("+vercelTokenEncrypted");
        const enc = (fresh as any)?.vercelTokenEncrypted as string | undefined;
        if (enc) { const dec = decrypt(enc); if (dec) vercelToken = dec; }
      } catch {}
      if (!vercelToken) {
        await editMsg(bot, query,
          "🚀 No Vercel token found.\n\nAdd your Vercel token via ⚙️ Settings → 🚀 Deployments, or set VERCEL_TOKEN in Replit Secrets.",
          backToMainKeyboard()
        );
        return;
      }
      const cached = getCachedBuild(userId);
      if (!cached) {
        await editMsg(bot, query,
          "⏳ Build session expired (45 min limit).\n\nRun /deploy <description> to generate and deploy a fresh project.",
          backToMainKeyboard()
        );
        return;
      }
      await bot.answerCallbackQuery(query.id, { text: "Starting deployment..." });
      const statusMsg = await bot.sendMessage(chatId,
        `✅ Project loaded (${cached.project.files.length} files)\n🚀 Deploying to Vercel...`
      );
      let statusMsgId = statusMsg.message_id;
      const updateStatus = async (text: string) => {
        try { await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId }); } catch {}
      };
      try {
        const result = await deployToVercel(
          vercelToken,
          cached.project.name,
          cached.project.files,
          async (msg) => updateStatus(msg)
        );
        try { await bot.deleteMessage(chatId, statusMsgId); } catch {}
        await bot.sendMessage(chatId,
          `🚀 Live!\n\n📦 ${cached.project.name}\n${cached.project.description}\n\n🌐 ${result.url}\n\n${cached.project.files.length} files · ${typeLabel(cached.project.type)}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🌐 Open Live Site", url: result.url }],
                [{ text: "🔍 Vercel Dashboard", url: result.inspectorUrl }],
                [{ text: "🌐 Build Another", callback_data: "build_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
              ],
            },
          }
        );
      } catch (err: any) {
        try { await bot.deleteMessage(chatId, statusMsgId); } catch {}
        await bot.sendMessage(chatId,
          `❌ Deployment failed. Check your Vercel token is valid and try /deploy again.`,
          { reply_markup: backToMainKeyboard() }
        );
      }
      return;
    }

    if (data === "deploy_render") {
      // Resolve Render token: user's saved token > env var
      let renderToken = process.env.RENDER_API_KEY;
      try {
        const fresh = await User.findOne({ userId }).select("+renderTokenEncrypted");
        const enc = (fresh as any)?.renderTokenEncrypted as string | undefined;
        if (enc) { const dec = decrypt(enc); if (dec) renderToken = dec; }
      } catch {}
      if (!renderToken) {
        await editMsg(bot, query,
          "🟣 No Render token found.\n\nAdd your Render API key via ⚙️ Settings → 🚀 Deployments.\n\nGet it at: https://dashboard.render.com/u/settings → API Keys",
          backToMainKeyboard()
        );
        return;
      }
      const cached = getCachedBuild(userId);
      if (!cached) {
        await editMsg(bot, query,
          "⏳ Build session expired. Run /build first to generate a project.",
          backToMainKeyboard()
        );
        return;
      }
      // Render requires a GitHub repo URL
      const repoUrl = (cached as any).repoUrl as string | undefined;
      if (!repoUrl) {
        await editMsg(bot, query,
          "🟣 Render deployment requires your project to be on GitHub.\n\nRun /build with GitHub connected (⚙️ Settings → 🔑 GitHub), then deploy to Render.",
          backToMainKeyboard()
        );
        return;
      }
      await bot.answerCallbackQuery(query.id, { text: "Starting Render deployment..." });
      const statusMsg = await bot.sendMessage(chatId, `🟣 Deploying to Render...\n\n📦 ${cached.project.name}`);
      let statusMsgId = statusMsg.message_id;
      const updateStatus = async (text: string) => {
        try { await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsgId }); } catch {}
      };
      try {
        const result = await deployToRender(renderToken, cached.project.name, repoUrl, updateStatus);
        try { await bot.deleteMessage(chatId, statusMsgId); } catch {}
        await bot.sendMessage(chatId,
          `🟣 Deployed to Render!\n\n📦 ${cached.project.name}\n\n🌐 ${result.url}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🌐 Open Live Site", url: result.url }],
                [{ text: "📊 Render Dashboard", url: result.inspectorUrl }],
                [{ text: "🌐 Build Another", callback_data: "build_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
              ],
            },
          }
        );
      } catch (err: any) {
        try { await bot.deleteMessage(chatId, statusMsgId); } catch {}
        await bot.sendMessage(chatId,
          `❌ Render deployment failed. Check your Render token and try again.`,
          { reply_markup: backToMainKeyboard() }
        );
      }
      return;
    }

    if (data === "build_menu") {
      // Check user's personal GitHub token OR env-level token
      let hasGitHub = false;
      try {
        const fresh = await User.findOne({ userId }).select("+github.tokenEncrypted");
        const enc = (fresh as any)?.github?.tokenEncrypted as string | undefined;
        const username = (fresh as any)?.github?.username || process.env.GITHUB_USERNAME;
        let token = process.env.GITHUB_TOKEN;
        if (enc) { const dec = decrypt(enc); if (dec) token = dec; }
        hasGitHub = !!(token && username);
      } catch {}

      setPending(userId, "build_input");
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId,
        `🌐 AI Website & App Builder\n\n` +
        `Describe what you want to build and I'll generate a complete, working project!\n\n` +
        `Examples:\n` +
        `• portfolio website for a photographer\n` +
        `• Netflix clone with movie cards\n` +
        `• todo app with dark mode\n` +
        `• React dashboard with live charts\n` +
        `• real-time chat app with Node.js\n` +
        `• expense tracker with charts\n` +
        `• quiz app with multiple choice questions\n\n` +
        (hasGitHub
          ? `✅ GitHub connected — project will be pushed to a repo automatically!\n\nWhat do you want to build? Type your idea below:`
          : `💡 After generation you can push to GitHub or receive files on Telegram.\n\nWhat do you want to build? Type your idea below:`),
        { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
      );
      return;
    }

    if (data === "build_choice_telegram") {
      await bot.answerCallbackQuery(query.id, { text: "Sending your files..." });
      const cached = getCachedBuild(userId);
      if (!cached) {
        await bot.sendMessage(chatId, "⚠️ Project session expired. Please build again.", { reply_markup: { inline_keyboard: [[{ text: "🌐 Build Again", callback_data: "build_menu" }]] } });
        return;
      }
      await bot.sendMessage(chatId, `📦 Sending ${cached.project.files.length} files for *${cached.project.name}*...`, { parse_mode: "Markdown" });
      for (const file of cached.project.files) {
        try {
          const buf = Buffer.from(file.content, "utf-8");
          const filename = file.path.split("/").pop() || file.path;
          await bot.sendDocument(chatId, buf, { caption: `📄 ${file.path}` }, { filename, contentType: "text/plain; charset=utf-8" });
          await new Promise((r) => setTimeout(r, 350));
        } catch {}
      }
      await bot.sendMessage(chatId,
        `✅ All files sent!\n\n💡 ${cached.project.deploymentTip}\n\n💡 Connect GitHub in ⚙️ Settings → 🔑 GitHub for auto-push next time.`,
        { reply_markup: { inline_keyboard: [
          [{ text: "🔑 Connect GitHub", callback_data: "settings_github" }, { text: "🌐 Build Another", callback_data: "build_menu" }],
          [{ text: "⬅️ Menu", callback_data: "main_menu" }],
        ]}}
      );
      return;
    }

    if (data === "build_choice_github") {
      await bot.answerCallbackQuery(query.id);
      const cached = getCachedBuild(userId);
      if (!cached) {
        await bot.sendMessage(chatId, "⚠️ Project session expired. Please build again.", { reply_markup: { inline_keyboard: [[{ text: "🌐 Build Again", callback_data: "build_menu" }]] } });
        return;
      }

      // Resolve GitHub credentials
      let ghToken: string | undefined = process.env.GITHUB_TOKEN;
      let ghUsername: string | undefined = process.env.GITHUB_USERNAME;
      try {
        const fresh = await User.findOne({ userId }).select("+github.tokenEncrypted");
        const enc = (fresh as any)?.github?.tokenEncrypted as string | undefined;
        const storedUsername = (fresh as any)?.github?.username as string | undefined;
        if (enc) { const dec = decrypt(enc); if (dec) ghToken = dec; }
        if (storedUsername) ghUsername = storedUsername;
      } catch {}

      if (!ghToken || !ghUsername) {
        await bot.sendMessage(chatId,
          `🔑 No GitHub account connected yet.\n\nConnect your GitHub token in Settings to push projects directly to your repos!`,
          { reply_markup: { inline_keyboard: [
            [{ text: "🔑 Connect GitHub", callback_data: "settings_github" }],
            [{ text: "📱 Send to Telegram Instead", callback_data: "build_choice_telegram" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
          ]}}
        );
        return;
      }

      const rawName = sanitizeRepoName(cached.project.name);
      let repoName = rawName;
      try {
        const exists = await repoExists(ghToken, ghUsername, rawName);
        if (exists) repoName = uniqueRepoName(rawName);
      } catch {}

      const statusMsg = await bot.sendMessage(chatId, `📤 Creating GitHub repository...`);
      const stopTyping = startTypingLoop(bot, chatId);

      let repoInfo: Awaited<ReturnType<typeof createGitHubRepo>>;
      try {
        repoInfo = await createGitHubRepo(ghToken, repoName, cached.project.description);
      } catch (err: any) {
        stopTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        const reason = err?.response?.status === 401
          ? "GitHub authentication failed. Check your token in ⚙️ Settings → 🔑 GitHub."
          : err?.response?.status === 422
          ? `A repo named "${repoName}" already exists on your account.`
          : `GitHub error: ${err?.response?.data?.message || err.message}`;
        await bot.sendMessage(chatId,
          `⚠️ ${reason}\n\nSend files to Telegram instead?`,
          { reply_markup: { inline_keyboard: [
            [{ text: "📱 Send to Telegram", callback_data: "build_choice_telegram" }],
            [{ text: "⬅️ Menu", callback_data: "main_menu" }],
          ]}}
        );
        return;
      }

      try {
        await bot.editMessageText(`✅ Repository created! Uploading ${cached.project.files.length} files...`, { chat_id: chatId, message_id: statusMsg.message_id });
      } catch {}

      try {
        await pushAllFiles(ghToken, ghUsername, repoInfo.name, cached.project.files, async (done, total) => {
          try { await bot.editMessageText(`📤 Uploading files... ${done}/${total}`, { chat_id: chatId, message_id: statusMsg.message_id }); } catch {}
        });
      } catch {
        stopTyping();
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}
        await bot.sendMessage(chatId, `⚠️ Upload failed partway. Repo: ${repoInfo.htmlUrl}\n\nSend remaining files to Telegram?`,
          { reply_markup: { inline_keyboard: [
            [{ text: "📱 Send to Telegram", callback_data: "build_choice_telegram" }],
            [{ text: "⬅️ Menu", callback_data: "main_menu" }],
          ]}}
        );
        return;
      }

      stopTyping();
      try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

      try {
        await User.findOneAndUpdate({ userId }, {
          $push: { projects: { name: cached.project.name, repoUrl: repoInfo.htmlUrl, deployUrl: undefined, createdAt: new Date() } },
          $inc: { "usage.builds": 1 },
        });
      } catch {}

      await bot.sendMessage(chatId,
        `🚀 Pushed to GitHub!\n\n📦 ${cached.project.name}\n${cached.project.description}\n\n🔗 ${repoInfo.htmlUrl}\n\n${cached.project.files.length} files · ${typeLabel(cached.project.type)}\n\n💡 ${cached.project.deploymentTip}`,
        { reply_markup: { inline_keyboard: [
          [{ text: "🔗 Open on GitHub", url: repoInfo.htmlUrl }],
          [{ text: "🌐 Build Another", callback_data: "build_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
        ]}}
      );
      return;
    }

    if (data === "search_btn") {
      setPending(userId, "search_input");
      await editMsg(bot, query,
        `🔍 Web Search\n\nWhat do you want to search for?\n\nExamples:\n• latest AI news\n• best programming languages 2025\n• how to make pasta carbonara`,
        backToMainKeyboard()
      );
      return;
    }

    if (data === "search_again") {
      setPending(userId, "search_input");
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId,
        `🔍 What do you want to search for?\n\nType your query:`,
        { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] } }
      );
      return;
    }

    if (data === "history_btn") {
      const stopTyping = startTypingLoop(bot, chatId);
      try {
        const historyPrompt =
          "Give me a detailed summary of our conversation history so far. List:\n" +
          "• Topics we've discussed\n" +
          "• Questions I asked\n" +
          "• Key things you've told me\n" +
          "• Any preferences or settings I've mentioned\n\n" +
          "If there's no significant history yet, say so briefly.";
        const reply = await chat(userId, chatId, historyPrompt, { style: "serious", emoji: false, length: "long" }, user.premium.active);
        stopTyping();
        await bot.sendMessage(chatId, `📜 Conversation History\n\n${reply}`, {
          reply_markup: { inline_keyboard: [
            [{ text: "🧹 Clear History", callback_data: "forget_memory" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
          ]},
        });
      } catch {
        stopTyping();
        await bot.sendMessage(chatId, "Could not retrieve history. Try again.", { reply_markup: backToMainKeyboard() });
      }
      return;
    }

    if (data === "reminders_btn") {
      const reminders = await listUserReminders(userId);
      if (reminders.length === 0) {
        await editMsg(bot, query,
          `⏰ Reminders\n\nYou have no upcoming reminders.\n\nSet one — type the time and message:\nExample: 30m Call mom`,
          {
            inline_keyboard: [
              [{ text: "➕ Set Reminder", callback_data: "remind_btn" }],
              [{ text: "⬅️ Back", callback_data: "main_menu" }],
            ],
          }
        );
        return;
      }
      const lines = reminders.map((r, i) => {
        const id = (r._id as any).toString().slice(-6);
        const when = formatDate(r.triggerAt);
        const msg = r.message.substring(0, 50);
        return `${i + 1}. ⏰ ${when}\n    "${msg}"${r.message.length > 50 ? "…" : ""}\n    ID: ${id}`;
      });
      const cancelBtns = reminders.map((r) => ([
        { text: `❌ Cancel: ${r.message.substring(0, 25)}${r.message.length > 25 ? "…" : ""}`, callback_data: `cancel_rem_${(r._id as any).toString().slice(-6)}` },
      ]));
      await editMsg(bot, query,
        `⏰ Your Reminders (${reminders.length})\n\n${lines.join("\n\n")}`,
        {
          inline_keyboard: [
            ...cancelBtns,
            [{ text: "➕ Set New Reminder", callback_data: "remind_btn" }],
            [{ text: "⬅️ Back", callback_data: "main_menu" }],
          ],
        }
      );
      return;
    }

    if (data === "remind_btn") {
      setPending(userId, "remind_input");
      await editMsg(bot, query,
        `⏰ Set a Reminder\n\nType the time and your message:\n\nExamples:\n• 30m Take a break\n• 2h Call mom\n• 1d Pay rent\n• 45s Check the oven\n\nFormat: <time> <message>`,
        backToMainKeyboard()
      );
      return;
    }

    if (data.startsWith("cancel_rem_")) {
      const shortId = data.replace("cancel_rem_", "");
      const reminders = await listUserReminders(userId);
      const target = reminders.find((r) => (r._id as any).toString().slice(-6) === shortId);
      if (!target) {
        await answer(bot, query.id, "Reminder not found or already sent.");
        return;
      }
      await cancelReminder((target._id as any).toString(), userId);
      await answer(bot, query.id, "✅ Reminder cancelled.");
      const remaining = await listUserReminders(userId);
      if (remaining.length === 0) {
        await editMsg(bot, query,
          `⏰ Reminders\n\nAll reminders cancelled. You have no upcoming reminders.`,
          {
            inline_keyboard: [
              [{ text: "➕ Set Reminder", callback_data: "remind_btn" }],
              [{ text: "⬅️ Back", callback_data: "main_menu" }],
            ],
          }
        );
        return;
      }
      const lines = remaining.map((r, i) => {
        const id = (r._id as any).toString().slice(-6);
        return `${i + 1}. ⏰ ${formatDate(r.triggerAt)}\n    "${r.message.substring(0, 50)}${r.message.length > 50 ? "…" : ""}"\n    ID: ${id}`;
      });
      const cancelBtns = remaining.map((r) => ([
        { text: `❌ Cancel: ${r.message.substring(0, 25)}${r.message.length > 25 ? "…" : ""}`, callback_data: `cancel_rem_${(r._id as any).toString().slice(-6)}` },
      ]));
      await editMsg(bot, query,
        `⏰ Your Reminders (${remaining.length})\n\n${lines.join("\n\n")}`,
        {
          inline_keyboard: [
            ...cancelBtns,
            [{ text: "➕ Set New Reminder", callback_data: "remind_btn" }],
            [{ text: "⬅️ Back", callback_data: "main_menu" }],
          ],
        }
      );
      return;
    }

    // ── Settings Module ───────────────────────────────────────────────────

    if (data === "settings_profile") {
      const premiumLine = user.premium.active
        ? `✅ Premium — expires ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}`
        : "🆓 Free Plan";
      await editMsg(bot, query,
        `👤 Your Profile\n\n` +
        `Name: ${user.firstName || "N/A"}\n` +
        `Username: ${user.username ? "@" + user.username : "N/A"}\n` +
        `ID: ${user.userId}\n` +
        `Status: ${premiumLine}\n` +
        `Style: ${user.settings.style}\n` +
        `Language: ${user.settings.language || "en"}\n` +
        `Mood: ${user.mood || "not set"}\n` +
        `Messages today: ${user.usage.messages}\n` +
        `Images today: ${user.usage.images}/${await getImageLimit(user.premium.active)}\n` +
        `Member since: ${formatDate(user.firstSeen)}`,
        backToSettingsKeyboard()
      );
      return;
    }

    if (data === "settings_premium") {
      const limit = await getImageLimit(user.premium.active);
      if (user.premium.active) {
        await editMsg(bot, query,
          `💎 Premium Member\n\n` +
          `Expires: ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}\n\n` +
          `Your perks:\n` +
          `✅ ${limit} images per day\n` +
          `✅ Longer AI context\n` +
          `✅ Richer, more detailed responses\n` +
          `✅ Priority processing`,
          backToMainKeyboard()
        );
      } else {
        await editMsg(bot, query,
          `🆓 Free Plan\n\n` +
          `Current limits:\n` +
          `• ${limit} images per day\n` +
          `• Standard AI responses\n\n` +
          `Upgrade to Premium:\n` +
          `• 20 images per day\n` +
          `• Richer, longer responses\n` +
          `• Priority processing\n\n` +
          `Use /redeem CODE to activate.\nAsk the bot owner for a premium code!`,
          backToMainKeyboard()
        );
      }
      return;
    }

    if (data === "settings_emoji_on") {
      user.settings.emoji = true;
      await user.save();
      const freshUser = await User.findOne({ userId });
      await editMsg(bot, query,
        `😊 Emojis turned ON! Nova will now express herself freely.`,
        settingsMenuKeyboard(freshUser!)
      );
      return;
    }

    if (data === "settings_emoji_off") {
      user.settings.emoji = false;
      await user.save();
      const freshUser = await User.findOne({ userId });
      await editMsg(bot, query,
        `😑 Emojis turned OFF. Clean and minimal it is.`,
        settingsMenuKeyboard(freshUser!)
      );
      return;
    }

    if (data === "settings_style") {
      await editMsg(bot, query,
        `🎭 AI Style\n\nCurrent: ${user.settings.style}\n\nHow do you want Nova to talk to you?`,
        styleMenuKeyboard(user.settings.style)
      );
      return;
    }

    if (data.startsWith("settings_style_")) {
      const newStyle = data.replace("settings_style_", "") as any;
      const valid = ["friendly", "funny", "serious", "balanced"];
      if (!valid.includes(newStyle)) return;
      user.settings.style = newStyle;
      await user.save();
      await editMsg(bot, query,
        `✅ Style set to: ${newStyle}\n\nPick another or go back:`,
        styleMenuKeyboard(newStyle)
      );
      return;
    }

    if (data === "settings_length") {
      await editMsg(bot, query,
        `📏 Reply Length\n\nCurrent: ${user.settings.length}\n\nHow long should Nova's replies be?`,
        lengthMenuKeyboard(user.settings.length)
      );
      return;
    }

    if (data === "settings_length_short") {
      user.settings.length = "short";
      await user.save();
      await editMsg(bot, query, `✅ Short replies — quick and to the point.`, lengthMenuKeyboard("short"));
      return;
    }

    if (data === "settings_length_long") {
      user.settings.length = "long";
      await user.save();
      await editMsg(bot, query, `✅ Long replies — detailed and expressive.`, lengthMenuKeyboard("long"));
      return;
    }

    if (data === "settings_lang") {
      await editMsg(bot, query,
        `🌐 Language\n\nCurrent: ${user.settings.language || "en"}\n\nNova will respond in your chosen language:`,
        langMenuKeyboard(user.settings.language || "en")
      );
      return;
    }

    if (data.startsWith("settings_lang_")) {
      const code = data.replace("settings_lang_", "");
      user.settings.language = code;
      await user.save();
      await editMsg(bot, query, `✅ Language set to: ${code}`, langMenuKeyboard(code));
      return;
    }

    // ── GitHub settings ──────────────────────────────────────────────────────

    if (data === "settings_github") {
      const userWithToken = await User.findOne({ userId }).select("+github.tokenEncrypted");
      const hasToken = !!(userWithToken as any)?.github?.tokenEncrypted;
      const username = user.github?.username;
      await editMsg(bot, query,
        `🔑 GitHub Integration\n\n` +
        `Username: ${username ? `@${username}` : "❌ Not set"}\n` +
        `Token: ${hasToken ? "✅ Saved securely (encrypted)" : "❌ Not set"}\n\n` +
        `Connect your GitHub account so Nova can automatically push your /build projects to your own repositories.\n\n` +
        `Your token is AES-256 encrypted and never shown after saving. Not even the bot owner can read it.`,
        githubSettingsKeyboard(hasToken, username)
      );
      return;
    }

    if (data === "github_set_username") {
      setPending(userId, "github_set_username");
      await editMsg(bot, query,
        `✏️ Set GitHub Username\n\nSend your GitHub username as a reply:\n\nExample: john-doe\n\n(No @ symbol needed)`,
        { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "settings_github" }]] }
      );
      return;
    }

    if (data === "github_set_token") {
      setPending(userId, "github_set_token");
      await editMsg(bot, query,
        `🔑 Set GitHub Token\n\nSend your GitHub Personal Access Token as a reply.\n\n` +
        `⚠️ Your message will be automatically deleted after saving.\n\n` +
        `How to create a token:\n` +
        `GitHub → Settings → Developer settings → Personal access tokens → Generate new token\n\n` +
        `Required scopes: ✅ repo (Full control of private repositories)`,
        { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "settings_github" }]] }
      );
      return;
    }

    if (data === "github_remove_token") {
      await User.updateOne({ userId }, { $unset: { "github.tokenEncrypted": 1 } });
      const username = user.github?.username;
      await editMsg(bot, query,
        `🗑 Token removed.\n\nYour GitHub token has been deleted securely.`,
        githubSettingsKeyboard(false, username)
      );
      return;
    }

    if (data === "github_remove_username") {
      await User.updateOne({ userId }, { $unset: { "github.username": 1 } });
      await editMsg(bot, query,
        `🗑 Username removed.`,
        githubSettingsKeyboard(false, undefined)
      );
      return;
    }

    if (data === "settings_deployments") {
      const fresh = await User.findOne({ userId }).select("+vercelTokenEncrypted +renderTokenEncrypted");
      const hasVercel = !!(fresh as any)?.vercelTokenEncrypted;
      const hasRender = !!(fresh as any)?.renderTokenEncrypted;
      await editMsg(bot, query,
        `🚀 Deployment Tokens\n\n` +
        `Connect your own Vercel or Render accounts. Your tokens are AES-256 encrypted and never visible.\n\n` +
        `⚡ Vercel: ${hasVercel ? "✅ Connected" : "❌ Not set"}\n` +
        `🟣 Render: ${hasRender ? "✅ Connected" : "❌ Not set"}\n\n` +
        `Get your Vercel token at: vercel.com → Settings → Tokens\n` +
        `Get your Render key at: dashboard.render.com → Account Settings → API Keys`,
        deploymentsKeyboard(hasVercel, hasRender)
      );
      return;
    }

    if (data === "vercel_set_token") {
      setPending(userId, "vercel_set_token");
      await editMsg(bot, query,
        `⚡ Set Vercel Token\n\nSend your Vercel access token.\n\n` +
        `⚠️ Message will be deleted after saving for security.\n\n` +
        `How to get one:\nvercel.com → Settings → Tokens → Create Token`,
        { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "settings_deployments" }]] }
      );
      return;
    }

    if (data === "vercel_remove_token") {
      await User.updateOne({ userId }, { $unset: { vercelTokenEncrypted: 1 } });
      await editMsg(bot, query,
        `🗑 Vercel token removed.`,
        deploymentsKeyboard(false, !!(await User.findOne({ userId }).select("+renderTokenEncrypted") as any)?.renderTokenEncrypted)
      );
      return;
    }

    if (data === "render_set_token") {
      setPending(userId, "render_set_token");
      await editMsg(bot, query,
        `🟣 Set Render API Key\n\nSend your Render API key.\n\n` +
        `⚠️ Message will be deleted after saving for security.\n\n` +
        `How to get one:\ndashboard.render.com → Account Settings → API Keys → Create API Key`,
        { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "settings_deployments" }]] }
      );
      return;
    }

    if (data === "render_remove_token") {
      await User.updateOne({ userId }, { $unset: { renderTokenEncrypted: 1 } });
      await editMsg(bot, query,
        `🗑 Render token removed.`,
        deploymentsKeyboard(!!(await User.findOne({ userId }).select("+vercelTokenEncrypted") as any)?.vercelTokenEncrypted, false)
      );
      return;
    }

    if (data === "my_projects") {
      const fresh = await User.findOne({ userId });
      const projects = (fresh?.projects ?? []) as Array<{ name: string; deployUrl?: string; repoUrl?: string; _id?: any }>;
      if (projects.length === 0) {
        await editMsg(bot, query,
          `📁 My Projects\n\nYou have no saved projects yet.\n\nUse /build to generate a project!`,
          { inline_keyboard: [[{ text: "🌐 Build a Project", callback_data: "build_menu" }, { text: "⬅️ Back", callback_data: "settings_deployments" }]] }
        );
        return;
      }
      await editMsg(bot, query,
        `📁 My Projects\n\nYou have ${projects.length} project${projects.length !== 1 ? "s" : ""}.\nFree users: 2 max · Premium: unlimited\n\nTap 🗑 to delete a project:`,
        projectsListKeyboard(projects)
      );
      return;
    }

    if (data.startsWith("proj_page_")) {
      const page = parseInt(data.replace("proj_page_", ""), 10) || 0;
      const fresh = await User.findOne({ userId });
      const projects = (fresh?.projects ?? []) as Array<{ name: string; deployUrl?: string }>;
      await editMsg(bot, query,
        `📁 My Projects (page ${page + 1})\n\n${projects.length} total:`,
        projectsListKeyboard(projects, page)
      );
      return;
    }

    if (data.startsWith("proj_open_")) {
      const idx = parseInt(data.replace("proj_open_", ""), 10);
      const fresh = await User.findOne({ userId });
      const projects = (fresh?.projects ?? []) as Array<{ name: string; deployUrl?: string; repoUrl?: string }>;
      const proj = projects[idx];
      if (!proj) {
        await bot.answerCallbackQuery(query.id, { text: "Project not found." });
        return;
      }
      const links: TelegramBot.InlineKeyboardButton[] = [];
      if (proj.deployUrl) links.push({ text: "🌐 Open Site", url: proj.deployUrl });
      if (proj.repoUrl) links.push({ text: "🔗 GitHub", url: proj.repoUrl });
      await editMsg(bot, query,
        `📦 ${proj.name}\n${proj.deployUrl ? `🌐 ${proj.deployUrl}` : "No deploy URL saved"}\n${proj.repoUrl ? `🔗 ${proj.repoUrl}` : ""}`,
        {
          inline_keyboard: [
            ...(links.length ? [links] : []),
            [{ text: "🗑 Delete", callback_data: `proj_del_${idx}` }],
            [{ text: "⬅️ Back", callback_data: "my_projects" }],
          ],
        }
      );
      return;
    }

    if (data.startsWith("proj_del_")) {
      const idx = parseInt(data.replace("proj_del_", ""), 10);
      const fresh = await User.findOne({ userId });
      const projects = (fresh?.projects ?? []) as Array<{ name: string }>;
      if (idx < 0 || idx >= projects.length) {
        await bot.answerCallbackQuery(query.id, { text: "Project not found." });
        return;
      }
      const projName = projects[idx].name;
      projects.splice(idx, 1);
      await User.updateOne({ userId }, { projects });
      const updatedProjects = projects as Array<{ name: string; deployUrl?: string }>;
      await editMsg(bot, query,
        `🗑 Deleted: ${projName}\n\n${updatedProjects.length} project${updatedProjects.length !== 1 ? "s" : ""} remaining.`,
        updatedProjects.length > 0
          ? projectsListKeyboard(updatedProjects)
          : { inline_keyboard: [[{ text: "🌐 Build a Project", callback_data: "build_menu" }, { text: "⬅️ Back", callback_data: "settings_deployments" }]] }
      );
      return;
    }

    if (data === "settings_mood") {
      await editMsg(bot, query,
        `😶 Set Your Mood\n\nCurrent: ${user.mood || "not set"}\n\nNova adapts her tone to match how you're feeling:`,
        moodPickerKeyboard(user.mood || undefined)
      );
      return;
    }

    if (data.startsWith("mood_set_")) {
      const mood = data.replace("mood_set_", "");
      user.mood = mood;
      await user.save();
      const moodEmojis: Record<string, string> = {
        happy: "😊", sad: "😔", stressed: "😤", bored: "😴",
        excited: "🤩", focused: "🎯", romantic: "😍", angry: "😠",
      };
      const emoji = moodEmojis[mood] || "😶";
      await editMsg(bot, query,
        `${emoji} Mood set to: ${mood}\n\nNova will adjust her energy to match yours.`,
        moodPickerKeyboard(mood)
      );
      return;
    }

    if (data === "mood_clear") {
      user.mood = undefined;
      await user.save();
      await editMsg(bot, query,
        `😶 Mood cleared — Nova's back to her natural vibe.`,
        moodPickerKeyboard(undefined)
      );
      return;
    }

    if (data === "settings_clear_memory") {
      await Memory.deleteOne({ userId, chatId });
      await editMsg(bot, query,
        `🧹 Memory cleared!\n\nNova has forgotten this conversation. Fresh start — say hi!`,
        backToSettingsKeyboard()
      );
      return;
    }

    // ── Admin Panel ───────────────────────────────────────────────────────

    if (data === "admin_menu") {
      const totalUsers = await User.countDocuments();
      const premiumUsers = await User.countDocuments({ "premium.active": true });
      const bannedUsers = await User.countDocuments({ banned: true });
      const totalGroups = await GroupSettings.countDocuments();
      await editMsg(bot, query,
        `Admin Panel\n\n` +
        `Moderation (use in group):\n` +
        `/ban — Ban a user\n` +
        `/unban — Unban a user\n` +
        `/mute [1m|1h|1d] — Mute a user\n` +
        `/unmute — Unmute a user\n` +
        `/warn [reason] — Warn a user\n` +
        `/kick — Kick a user\n\n` +
        `Management:\n` +
        `/lock / /unlock — Lock or unlock group\n` +
        `/purge <n> — Delete last N messages\n\n` +
        `Stats:\n` +
        `Total users: ${totalUsers}  |  Premium: ${premiumUsers}\n` +
        `Banned: ${bannedUsers}  |  Active groups: ${totalGroups}`,
        backToMainKeyboard()
      );
      return;
    }

    // ── Quick Repeat Actions ──────────────────────────────────────────────

    if (data === "quick_quote") {
      await editMsg(bot, query, "✍️ Fetching a quote...");
      const reply = await chat(userId, chatId + 1111, "Give me one inspiring or thought-provoking quote. Format: \"Quote\" — Author. No intro.", { style: "friendly", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `💬 Quote\n\n${reply}`, repeatKeyboard("quick_quote", "fun_menu"));
      return;
    }

    if (data === "quick_fact") {
      await editMsg(bot, query, "🔍 Looking up something wild...");
      const reply = await chat(userId, chatId + 2222, "Tell me one surprising, mind-blowing, and true fact. Keep it to 2-3 sentences. Start directly with the fact.", { style: "balanced", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `🎲 Did You Know?\n\n${reply}`, repeatKeyboard("quick_fact", "fun_menu"));
      return;
    }

    if (data === "quick_tip") {
      await editMsg(bot, query, "💡 Thinking...");
      const reply = await chat(userId, chatId + 3333, "Give me one specific, actionable productivity, health, or life improvement tip. 2-3 sentences. No generic advice.", { style: "balanced", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `💡 Tip\n\n${reply}`, repeatKeyboard("quick_tip", "main_menu"));
      return;
    }

    // ── Show Profile ──────────────────────────────────────────────────────
    if (data === "show_profile") {
      const name = user.firstName || user.username || "Friend";
      const premiumLine = user.premium.active
        ? `✨ Premium — expires ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}`
        : "Free";
      const builds2 = user.usage.builds ?? 0;
      const daysSinceJoin = Math.floor((Date.now() - user.firstSeen.getTime()) / 86400000);
      await editMsg(bot, query,
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
        `Total builds: ${builds2}\n` +
        `Groups: ${user.groups.length}\n` +
        `Warnings: ${user.warnings}`,
        { inline_keyboard: [[{ text: "⚙️ Settings", callback_data: "settings_menu" }, { text: "📊 Stats", callback_data: "show_stats" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] }
      );
      return;
    }

    // ── Show Stats ────────────────────────────────────────────────────────
    if (data === "show_stats") {
      const name = user.firstName || user.username || "Friend";
      const premiumLine = user.premium.active
        ? `✨ Premium${user.premium.expiresAt ? ` (expires ${formatDate(user.premium.expiresAt)})` : ""}`
        : "Free";
      const imageLimit = await getImageLimit(user.premium.active);
      const daysSinceJoin = Math.floor((Date.now() - user.firstSeen.getTime()) / 86400000);
      const builds2 = user.usage.builds ?? 0;
      await editMsg(bot, query,
        `📊 Your Stats\n\n` +
        `👤 ${name}\n` +
        `🆔 ID: ${user.userId}\n` +
        `🗓️ Member for: ${daysSinceJoin} day${daysSinceJoin !== 1 ? "s" : ""}\n` +
        `💎 Plan: ${premiumLine}\n\n` +
        `── Today ──\n` +
        `💬 Messages: ${user.usage.messages}\n` +
        `🖼️ Images: ${user.usage.images}/${imageLimit >= 999999 ? "∞" : imageLimit}\n\n` +
        `── All Time ──\n` +
        `🔨 Builds: ${builds2}\n` +
        `👥 Groups: ${user.groups.length}\n` +
        `🎭 Style: ${user.settings.style}\n` +
        `🌐 Language: ${user.settings.language || "en"}`,
        { inline_keyboard: [[{ text: "👤 Profile", callback_data: "show_profile" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] }
      );
      return;
    }

    // ── Owner Panel ───────────────────────────────────────────────────────

    if (data === "own_panel") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      await sendOwnerPanel(bot, chatId, getMaintenance, query.message!.message_id);
      return;
    }

    if (data === "own_stats") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const [totalUsers, premiumUsers, bannedUsers, activeToday, totalMemories, totalCodes, totalGroups] =
        await Promise.all([
          User.countDocuments(),
          User.countDocuments({ "premium.active": true }),
          User.countDocuments({ banned: true }),
          User.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 86400000) } }),
          Memory.countDocuments(),
          (await import("../models/RedeemCode.js")).RedeemCode.countDocuments(),
          GroupSettings.countDocuments(),
        ]);
      const usageResult = await User.aggregate([
        { $group: { _id: null, msgs: { $sum: "$usage.messages" }, imgs: { $sum: "$usage.images" } } },
      ]);
      const usage = usageResult[0] || { msgs: 0, imgs: 0 };
      const config = await getOrCreateBotConfig();
      await editMsg(bot, query,
        `📊 Full Statistics\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Total users: ${totalUsers}\n` +
        `🕐 Active today: ${activeToday}\n` +
        `💎 Premium: ${premiumUsers}\n` +
        `🚫 Banned: ${bannedUsers}\n` +
        `🏘 Groups: ${totalGroups}\n` +
        `🧠 Memories: ${totalMemories}\n` +
        `🎟 Codes: ${totalCodes}\n` +
        `💬 Total messages: ${usage.msgs}\n` +
        `🖼 Total images: ${usage.imgs}\n` +
        `🔧 Maintenance: ${getMaintenance() ? "🔴 ON" : "🟢 OFF"}\n\n` +
        `🧠 Chat: ${config.chatModels.find((m) => m.id === config.activeChatModel)?.name || config.activeChatModel}\n` +
        `🖼 Image: ${config.imageModels.find((m) => m.id === config.activeImageModel)?.name || config.activeImageModel}`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_users") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const total = await User.countDocuments();
      const premium = await User.countDocuments({ "premium.active": true });
      const banned = await User.countDocuments({ banned: true });
      await editMsg(bot, query,
        `👥 User Management\n━━━━━━━━━━━━━━━\nTotal: ${total}  |  Premium: ${premium}  |  Banned: ${banned}\n\nSelect an action:`,
        ownerUsersKeyboard()
      );
      return;
    }

    if (data === "own_premium") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const total = await User.countDocuments({ "premium.active": true });
      await editMsg(bot, query,
        `💎 Premium Management\n━━━━━━━━━━━━━━━━━━━\nActive premium users: ${total}\n\nSelect an action:`,
        ownerPremiumKeyboard()
      );
      return;
    }

    if (data === "own_codes") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const { RedeemCode } = await import("../models/RedeemCode.js");
      const total = await RedeemCode.countDocuments();
      const used = await RedeemCode.countDocuments({ used: true });
      await editMsg(bot, query,
        `🎟 Redeem Codes\n━━━━━━━━━━━━━━\nTotal: ${total}  |  Used: ${used}  |  Available: ${total - used}\n\nSelect an action:`,
        ownerCodesKeyboard()
      );
      return;
    }

    if (data === "own_broadcast") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const total = await User.countDocuments({ banned: false });
      await editMsg(bot, query,
        `📢 Broadcast\n━━━━━━━━━━━\nWill reach ${total} active users.\n\nSelect broadcast type:`,
        ownerBroadcastKeyboard()
      );
      return;
    }

    if (data === "own_groups") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const total = await GroupSettings.countDocuments();
      await editMsg(bot, query,
        `🏘 Group Management\n━━━━━━━━━━━━━━━━━\nTotal groups: ${total}\n\nSelect an action:`,
        ownerGroupsKeyboard()
      );
      return;
    }

    if (data === "own_maint") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setMaintenance(!getMaintenance());
      const now = getMaintenance();
      await answer(bot, query.id, now ? "🔴 Maintenance ON" : "🟢 Maintenance OFF");
      await sendOwnerPanel(bot, chatId, getMaintenance, query.message!.message_id);
      return;
    }

    if (data === "own_searchuser") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_searchuser");
      await editMsg(bot, query,
        `🔍 Search User\n\nSend a @username or display name to look them up.\n\nExample: @john or John`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_dm_btn") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_dm_step1");
      await editMsg(bot, query,
        `📩 DM a User\n\nStep 1 of 2 — Send the user's Telegram ID:\n\nExample: 123456789`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_scheduled") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      await editMsg(bot, query,
        `📋 Scheduled Broadcasts\n\nManage pending scheduled messages:\n\n` +
        `/listscheduled — List all pending with IDs\n` +
        `/cancelschedule <id> — Cancel by ID\n` +
        `/schedule <minutes> <message> — Create new\n\n` +
        `Note: schedules are held in memory and clear on server restart.`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_feedback") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const { Feedback } = await import("../models/Feedback.js");
      const [recent, unread] = await Promise.all([
        Feedback.find().sort({ createdAt: -1 }).limit(5),
        Feedback.countDocuments({ read: false }),
      ]);
      if (recent.length === 0) {
        await editMsg(bot, query,
          `📨 Feedback Inbox\n\nNo feedback received yet.\n\nUsers can send:\n/feedback <message> — General feedback\n/appeal <reason> — Ban appeal`,
          backToOwnerKeyboard()
        );
        return;
      }
      const lines = recent.map((f, i) => {
        const label = f.type === "appeal" ? "🔴 Appeal" : "💬 Feedback";
        const name = f.username ? `@${f.username}` : (f.firstName || String(f.userId));
        const preview = f.message.length > 60 ? f.message.slice(0, 60) + "..." : f.message;
        return `${i + 1}. ${label} — ${name}\n${preview}`;
      }).join("\n\n");
      await editMsg(bot, query,
        `📨 Feedback Inbox — ${unread} unread\n\n${lines}\n\nView all at the admin dashboard.`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "owner_panel") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      await sendOwnerPanel(bot, chatId, getMaintenance, query.message!.message_id);
      return;
    }

    if (data === "own_chat_models") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const active = config.chatModels.find((m) => m.id === config.activeChatModel);
      await editMsg(bot, query,
        `🧠 Chat AI Models\n━━━━━━━━━━━━━━━━\nActive: ${active?.name || config.activeChatModel}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerChatModelsKeyboard(config.chatModels, config.activeChatModel)
      );
      return;
    }

    if (data === "own_img_models") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const active = config.imageModels.find((m) => m.id === config.activeImageModel);
      await editMsg(bot, query,
        `🖼 Image Models\n━━━━━━━━━━━━━━\nActive: ${active?.name || config.activeImageModel}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerImageModelsKeyboard(config.imageModels, config.activeImageModel)
      );
      return;
    }

    if (data.startsWith("own_set_chat_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const idx = parseInt(data.replace("own_set_chat_", ""));
      const config = await getOrCreateBotConfig();
      const model = config.chatModels[idx];
      if (!model) { await answer(bot, query.id, "Model not found."); return; }
      config.activeChatModel = model.id;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ Switched to ${model.name}`);
      await editMsg(bot, query,
        `🧠 Chat AI Models\n━━━━━━━━━━━━━━━━\nActive: ${model.name}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerChatModelsKeyboard(config.chatModels, config.activeChatModel)
      );
      return;
    }

    if (data.startsWith("own_set_img_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const idx = parseInt(data.replace("own_set_img_", ""));
      const config = await getOrCreateBotConfig();
      const model = config.imageModels[idx];
      if (!model) { await answer(bot, query.id, "Model not found."); return; }
      config.activeImageModel = model.id;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ Switched to ${model.name}`);
      await editMsg(bot, query,
        `🖼 Image Models\n━━━━━━━━━━━━━━\nActive: ${model.name}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerImageModelsKeyboard(config.imageModels, config.activeImageModel)
      );
      return;
    }

    if (data.startsWith("own_del_chat_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const idx = parseInt(data.replace("own_del_chat_", ""));
      const config = await getOrCreateBotConfig();
      if (config.chatModels.length <= 1) { await answer(bot, query.id, "Cannot delete the only model."); return; }
      const removed = config.chatModels.splice(idx, 1)[0];
      if (config.activeChatModel === removed?.id) config.activeChatModel = config.chatModels[0].id;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `🗑 Removed ${removed?.name}`);
      const active = config.chatModels.find((m) => m.id === config.activeChatModel);
      await editMsg(bot, query,
        `🧠 Chat AI Models\n━━━━━━━━━━━━━━━━\nActive: ${active?.name || config.activeChatModel}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerChatModelsKeyboard(config.chatModels, config.activeChatModel)
      );
      return;
    }

    if (data.startsWith("own_del_img_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const idx = parseInt(data.replace("own_del_img_", ""));
      const config = await getOrCreateBotConfig();
      if (config.imageModels.length <= 1) { await answer(bot, query.id, "Cannot delete the only model."); return; }
      const removed = config.imageModels.splice(idx, 1)[0];
      if (config.activeImageModel === removed?.id) config.activeImageModel = config.imageModels[0].id;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `🗑 Removed ${removed?.name}`);
      await editMsg(bot, query,
        `🖼 Image Models\n━━━━━━━━━━━━━━\nActive: ${config.imageModels.find((m) => m.id === config.activeImageModel)?.name}\n\nTap to switch. 🗑 to remove.\nAdd new with ➕.`,
        ownerImageModelsKeyboard(config.imageModels, config.activeImageModel)
      );
      return;
    }

    if (data === "own_add_chat") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_add_chat_step1");
      await editMsg(bot, query,
        `🧠 Add Chat Model — Step 1 of 2\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nWhat do you want to call this model?\n\nExamples: GPT-4o, Claude 3.5, Llama 3.3\n\nJust type the display name:`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_add_img") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_add_img_step1");
      await editMsg(bot, query,
        `🖼 Add Image Model — Step 1 of 2\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nWhat do you want to call this model?\n\nExamples: FLUX Dev, SD 3, Playground v3\n\nJust type the display name:`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_do_lookup") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_lookup");
      await editMsg(bot, query, `🔍 Lookup User\n━━━━━━━━━━━━━\nSend the user's Telegram ID:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_ban") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_ban");
      await editMsg(bot, query, `⛔ Ban User\n━━━━━━━━━━\nSend the user's Telegram ID to ban:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_unban") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_unban");
      await editMsg(bot, query, `✅ Unban User\n━━━━━━━━━━━━\nSend the user's Telegram ID to unban:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_del_user") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_deleteuser");
      await editMsg(bot, query, `🗑 Delete User\n━━━━━━━━━━━━━\nSend the user's Telegram ID to permanently delete:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_clear_mem") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_cleardata");
      await editMsg(bot, query, `🧹 Clear Memory\n━━━━━━━━━━━━━━\nSend the user's Telegram ID to clear their memory:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_grant") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_grantpremium");
      await editMsg(bot, query,
        `💎 Grant Premium\n━━━━━━━━━━━━━━━\nSend: <code>user_id duration</code>\n\nExample: <code>123456789 30d</code>\nDurations: 1d, 7d, 30d, 90d, 1y, lifetime`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_do_revoke") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_revokepremium");
      await editMsg(bot, query, `➖ Revoke Premium\n━━━━━━━━━━━━━━━━\nSend the user's Telegram ID:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_bc") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_broadcast");
      await editMsg(bot, query, `📣 Broadcast\n━━━━━━━━━━━\nType the message to send to all users:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_ann") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_announcement");
      await editMsg(bot, query, `📢 Announcement\n━━━━━━━━━━━━━━\nType the announcement (will be prefixed with 📢 NOVA ANNOUNCEMENT):`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_sched") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_schedule");
      await editMsg(bot, query,
        `⏰ Schedule Broadcast\n━━━━━━━━━━━━━━━━━━━\nSend: <code>minutes message</code>\n\nExample: <code>30 Hello everyone!</code>`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_do_mkcode") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_createcode");
      await editMsg(bot, query,
        `➕ Create Code\n━━━━━━━━━━━━━\nSend: <code>CODE duration</code>\n\nExample: <code>NOVA-VIP 30d</code>\nDurations: 1d, 7d, 30d, 90d, 1y, lifetime`,
        backToOwnerKeyboard()
      );
      return;
    }

    if (data === "own_do_reset_code") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_resetcode");
      await editMsg(bot, query, `🔄 Reset Code\n━━━━━━━━━━━━\nSend the code name to reset:\nExample: <code>NOVA-VIP</code>`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_do_del_grp") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      setPending(userId, "owner_deletegroup");
      await editMsg(bot, query, `🗑 Delete Group\n━━━━━━━━━━━━━━\nSend the group's Chat ID:`, backToOwnerKeyboard());
      return;
    }

    if (data === "own_list_codes") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const { RedeemCode } = await import("../models/RedeemCode.js");
      const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(20);
      if (!codes.length) {
        await editMsg(bot, query, `🎟 No codes found.`, ownerCodesKeyboard());
        return;
      }
      const lines = codes.map((c) => `${c.code} | ${c.duration} | ${c.used ? `Used by ${c.usedBy}` : "Available"}`);
      await editMsg(bot, query, `🎟 Redeem Codes:\n\n${lines.join("\n")}`, ownerCodesKeyboard());
      return;
    }

    if (data === "own_grouplist") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const groups = await GroupSettings.find().sort({ updatedAt: -1 }).limit(20);
      if (!groups.length) {
        await editMsg(bot, query, `🏘 No groups found.`, ownerGroupsKeyboard());
        return;
      }
      const lines = groups.map((g, i) => `${i + 1}. ${g.title || "Unnamed"} (${g.chatId}) AI:${g.aiEnabled ? "on" : "off"}`);
      await editMsg(bot, query, `🏘 Groups:\n\n${lines.join("\n")}`, ownerGroupsKeyboard());
      return;
    }

    if (data.startsWith("own_userlist_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const page = Math.max(1, parseInt(data.replace("own_userlist_", "")) || 1);
      const perPage = 10;
      const [users, total] = await Promise.all([
        User.find().sort({ lastSeen: -1 }).skip((page - 1) * perPage).limit(perPage),
        User.countDocuments(),
      ]);
      if (!users.length) { await editMsg(bot, query, "No users found.", ownerUsersKeyboard()); return; }
      const totalPages = Math.ceil(total / perPage);
      const lines = users.map((u, i) => {
        const badge = u.premium.active ? "💎" : u.banned ? "🚫" : "👤";
        return `${badge} ${u.firstName || "?"} ${u.username ? "@" + u.username : ""} (${u.userId})`;
      });
      await editMsg(bot, query,
        `👥 Users — Page ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━\n${lines.join("\n")}`,
        ownerUserListKeyboard(page, totalPages)
      );
      return;
    }

    // ── User: AI Model (owner-only — regular users see info) ─────────────

    if (data === "model_panel") {
      await answer(bot, query.id);
      await editMsg(bot, query,
        `🤖 AI Model\n━━━━━━━━━━\nThe AI model is selected automatically based on your account type.\n\nPremium users get access to higher-quality models automatically.`,
        { inline_keyboard: [[{ text: "💎 Get Premium", callback_data: "settings_premium" }, { text: "⬅️ Back", callback_data: "settings_menu" }]] }
      );
      return;
    }

    if (data.startsWith("model_pick_")) {
      await answer(bot, query.id, "Model selection is managed by the bot owner.");
      return;
    }

    // ── Mode selection ─────────────────────────────────────────────────────────

    // ── Account menu ──────────────────────────────────────────────────────────

    if (data === "account_menu") {
      const userRecord = await User.findOne({ userId });
      if (!userRecord) { await answer(bot, query.id); return; }
      const credits = (userRecord as any).credits ?? 0;
      const isPrem = userRecord.premium.active;
      const expiry = userRecord.premium.expiresAt ? ` (until ${formatDate(userRecord.premium.expiresAt)})` : "";
      const referrals = userRecord.referrals?.length ?? 0;
      await editMsg(bot, query,
        `📊 My Account\n\n` +
        `👤 User ID: ${userId}\n` +
        `✨ Plan: ${isPrem ? `⭐ VIP${expiry}` : "Free"}\n` +
        `💰 Credits: ${credits}\n` +
        `👥 Referrals: ${referrals}\n\n` +
        `${isPrem ? "Thank you for being a VIP member!" : "Upgrade to VIP for unlimited access + no credit deductions."}`,
        accountMenuKeyboard(isPrem)
      );
      return;
    }

    // ── Daily reward ──────────────────────────────────────────────────────────

    if (data === "daily_reward") {
      const userRecord = await User.findOne({ userId });
      if (!userRecord) { await answer(bot, query.id); return; }
      const now = new Date();
      const lastClaim = (userRecord as any).lastDailyReward as Date | undefined;
      const config = await getOrCreateBotConfig();
      const dailyAmount = config.creditRewards?.dailyReward ?? 25;
      const cooldownHours = 20;
      if (lastClaim) {
        const hoursSince = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSince < cooldownHours) {
          const hoursLeft = Math.ceil(cooldownHours - hoursSince);
          const minsLeft = Math.ceil((cooldownHours - hoursSince) * 60) % 60;
          await answer(bot, query.id, `⏳ Already claimed today!`, true);
          await editMsg(bot, query,
            `🎁 Daily Reward\n\n⏳ You already claimed your reward today!\n\nNext reward in: ${hoursLeft}h ${minsLeft}m\n\nCome back tomorrow for ${dailyAmount} more credits!`,
            { inline_keyboard: [[{ text: "📊 My Account", callback_data: "account_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }]] }
          );
          return;
        }
      }
      (userRecord as any).lastDailyReward = now;
      await userRecord.save();
      const newBal = await addCredits(userId, dailyAmount);
      await answer(bot, query.id, `🎁 +${dailyAmount} credits claimed!`, true);
      await editMsg(bot, query,
        `🎁 Daily Reward Claimed!\n\n+${dailyAmount} credits added to your account.\n💰 New balance: ${newBal} credits\n\nCome back in 20 hours for your next reward!`,
        { inline_keyboard: [
          [{ text: "💰 Credits", callback_data: "credits_menu" }, { text: "📊 My Account", callback_data: "account_menu" }],
          [{ text: "⬅️ Menu", callback_data: "main_menu" }],
        ]}
      );
      return;
    }

    // ── Credits menu ──────────────────────────────────────────────────────────

    if (data === "credits_menu") {
      const userRecord = await User.findOne({ userId });
      if (!userRecord) { await answer(bot, query.id); return; }
      const credits = (userRecord as any).credits ?? 0;
      const config = await getOrCreateBotConfig();
      const hasPayment = hasAnyPaymentProvider();
      const flashOffer = (config as any).flashOffer;
      let flashText = "";
      if (flashOffer?.active) {
        flashText = `\n\n⚡ Flash Offer: ${flashOffer.title}\n${flashOffer.description} (+${flashOffer.creditsAmount} credits)`;
      }
      await editMsg(bot, query,
        `💰 Credits\n\nBalance: ${credits} credits\n\nCredit costs:\n• 💬 Chat: 1 credit\n• 🎨 Image: 5 credits\n• 🌐 Build: 20 credits\n• 🔊 Voice: 3 credits${flashText}\n\n⭐ VIP members skip all credit deductions!`,
        creditsMenuKeyboard(hasPayment)
      );
      return;
    }

    if (data === "credits_coming_soon") {
      await answer(bot, query.id, "Payment system coming soon!", true);
      return;
    }

    if (data.startsWith("buy_pack_")) {
      await answer(bot, query.id, "Payment integration coming soon. Stay tuned!", true);
      return;
    }

    // ── Referral menu ─────────────────────────────────────────────────────────

    if (data === "referral_menu") {
      const userRecord = await User.findOne({ userId });
      if (!userRecord) { await answer(bot, query.id); return; }
      let refCode = userRecord.referralCode;
      if (!refCode) {
        refCode = `NOVA${userId.toString(36).toUpperCase()}`;
        userRecord.referralCode = refCode;
        await userRecord.save();
      }
      const referrals = userRecord.referrals?.length ?? 0;
      const config = await getOrCreateBotConfig();
      const referrerBonus = config.creditRewards?.referrer ?? 50;
      const newUserBonus = config.creditRewards?.newUser ?? 20;
      let botUsername = "nova_ai_bot";
      try { const me = await bot.getMe(); botUsername = me.username ?? botUsername; } catch {}
      await editMsg(bot, query,
        `👥 Referral Program\n\nShare your link and earn ${referrerBonus} credits per friend!\n\nYour code: \`${refCode}\`\nFriends referred: ${referrals}\nTotal earned: ${referrals * referrerBonus} credits\n\nWhen a friend joins with your link:\n• You get: +${referrerBonus} credits + 7 days VIP\n• They get: +${newUserBonus} credits + 3 days VIP`,
        referralKeyboard(botUsername, refCode)
      );
      return;
    }

    // ── Flash offer ───────────────────────────────────────────────────────────

    if (data === "flash_offer") {
      const config = await getOrCreateBotConfig();
      const flashOffer = (config as any).flashOffer;
      if (!flashOffer?.active) {
        await answer(bot, query.id, "No active flash offer right now.", true);
        return;
      }
      await answer(bot, query.id, "Payment coming soon!", true);
      await editMsg(bot, query,
        `⚡ Flash Offer: ${flashOffer.title}\n\n${flashOffer.description}\n\nReward: +${flashOffer.creditsAmount} credits\n\n💳 Payment integration coming soon — stay tuned!`,
        { inline_keyboard: [[{ text: "⬅️ Credits", callback_data: "credits_menu" }]] }
      );
      return;
    }

    // ── Modes menu ────────────────────────────────────────────────────────────

    if (data === "modes_menu") {
      const userRecord = await User.findOne({ userId });
      const isPrem = userRecord?.premium?.active ?? false;
      const currentMode = await getUserMode(userId);
      await editMsg(bot, query,
        `🎯 Select a Mode\n\nCurrent: ${currentMode.icon} ${currentMode.name}\n${currentMode.description}\n\nPick a mode below — every message you send will be routed to that feature:\n\n🔒 = VIP only mode`,
        modeSelectKeyboard(currentMode.id, isPrem)
      );
      return;
    }

    if (data.startsWith("mode_set_")) {
      const modeId = data.replace("mode_set_", "");
      if (!isValidMode(modeId)) { await answer(bot, query.id, "Unknown mode."); return; }
      const mode = getModeById(modeId)!;
      // Check if mode is premium-only
      if (mode.premiumOnly) {
        const userRecord = await User.findOne({ userId });
        const isPrem = userRecord?.premium?.active ?? false;
        if (!isPrem) {
          await answer(bot, query.id, `🔒 ${mode.name} is a VIP feature`, true);
          await editMsg(bot, query,
            `🔒 ${mode.icon} ${mode.name} — VIP Feature\n\n${mode.description}\n\nUpgrade to VIP to unlock this mode and get:\n• Unlimited messages\n• No credit deductions\n• All premium modes\n• Priority responses`,
            { inline_keyboard: [
              [{ text: "⭐ Go VIP", callback_data: "settings_premium" }],
              [{ text: "🔄 Back to Modes", callback_data: "modes_menu" }, { text: "⬅️ Menu", callback_data: "main_menu" }],
            ]}
          );
          return;
        }
      }
      await setUserMode(userId, modeId as any);
      await answer(bot, query.id, `${mode.icon} ${mode.name} mode activated`);
      await editMsg(bot, query,
        `${mode.icon} Mode: ${mode.name}\n\n${mode.activationHint}\n\n${modeId === "nova" ? "Chat with Nova normally — all features are available." : `Every message you send will be treated as a ${mode.name} request.`}`,
        currentModeKeyboard(mode)
      );
      return;
    }

    // ── Group Settings toggles (from inline keyboard in group) ────────────

    if (data.startsWith("grp_tog_")) {
      const match = data.match(/^grp_tog_(.+?)_(-?\d+)$/);
      if (!match) { await answer(bot, query.id); return; }
      const field = match[1];
      const groupChatId = parseInt(match[2]);
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins can change settings."); return; }
      const gs = await GroupSettings.findOne({ chatId: groupChatId });
      if (!gs) { await answer(bot, query.id, "Settings not found."); return; }
      const lengthOptions: Array<"short" | "long"> = ["short", "long"];
      if (field === "length") {
        const cur = lengthOptions.indexOf(gs.length);
        gs.length = lengthOptions[(cur + 1) % lengthOptions.length];
      } else {
        (gs as any)[field] = !(gs as any)[field];
      }
      await gs.save();
      await answer(bot, query.id, "✅ Updated");
      const { groupSettingsKeyboard } = await import("../utils/keyboards.js");
      try { await bot.editMessageReplyMarkup(groupSettingsKeyboard(gs, groupChatId) as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {}
      return;
    }

    if (data.startsWith("grp_style_") && !data.startsWith("grp_setstyle_")) {
      const groupChatId = parseInt(data.replace("grp_style_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      const gs = await GroupSettings.findOne({ chatId: groupChatId });
      const { groupStyleKeyboard } = await import("../utils/keyboards.js");
      await answer(bot, query.id);
      try { await bot.editMessageReplyMarkup(groupStyleKeyboard(groupChatId, gs?.style || "friendly") as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {}
      return;
    }

    if (data.startsWith("grp_setstyle_")) {
      const match = data.match(/^grp_setstyle_(.+?)_(-?\d+)$/);
      if (!match) { await answer(bot, query.id); return; }
      const style = match[1]; const groupChatId = parseInt(match[2]);
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      const gs = await GroupSettings.findOneAndUpdate({ chatId: groupChatId }, { style }, { new: true });
      await answer(bot, query.id, `✅ Style: ${style}`);
      if (gs) { const { groupSettingsKeyboard } = await import("../utils/keyboards.js"); try { await bot.editMessageReplyMarkup(groupSettingsKeyboard(gs, groupChatId) as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {} }
      return;
    }

    if (data.startsWith("grp_slowmode_") && !data.startsWith("grp_slowmode_set")) {
      const groupChatId = parseInt(data.replace("grp_slowmode_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      const gs = await GroupSettings.findOne({ chatId: groupChatId });
      if (!gs) return;
      const opts = [0, 5, 10, 30, 60]; const cur = opts.indexOf(gs.slowmode);
      gs.slowmode = opts[(cur + 1) % opts.length];
      await gs.save();
      await answer(bot, query.id, `⏱ Slowmode: ${gs.slowmode}s`);
      const { groupSettingsKeyboard } = await import("../utils/keyboards.js");
      try { await bot.editMessageReplyMarkup(groupSettingsKeyboard(gs, groupChatId) as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {}
      return;
    }

    if (data.startsWith("grp_warnlimit_")) {
      const groupChatId = parseInt(data.replace("grp_warnlimit_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      const gs = await GroupSettings.findOne({ chatId: groupChatId });
      if (!gs) return;
      const opts = [2, 3, 4, 5, 10]; const cur = opts.indexOf(gs.warnLimit);
      gs.warnLimit = opts[(cur + 1) % opts.length];
      await gs.save();
      await answer(bot, query.id, `⚠️ Warn limit: ${gs.warnLimit}`);
      const { groupSettingsKeyboard } = await import("../utils/keyboards.js");
      try { await bot.editMessageReplyMarkup(groupSettingsKeyboard(gs, groupChatId) as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {}
      return;
    }

    if (data.startsWith("grp_welcome_")) {
      const groupChatId = parseInt(data.replace("grp_welcome_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      await answer(bot, query.id);
      await bot.sendMessage(chatId, `👋 To set a welcome message, use:\n\n/welcome Your text here\n\nPlaceholders: {name} = username, {group} = group name`);
      return;
    }

    if (data.startsWith("grp_goodbye_")) {
      const groupChatId = parseInt(data.replace("grp_goodbye_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      await answer(bot, query.id);
      await bot.sendMessage(chatId, `👋 To set a goodbye message, use:\n\n/setgoodbye Your text here\n\nPlaceholders: {name} = username, {group} = group name`);
      return;
    }

    if (data.startsWith("grp_rules_")) {
      const groupChatId = parseInt(data.replace("grp_rules_", ""));
      const isAdm = await (async () => { try { const m = await bot.getChatMember(groupChatId, userId); return ["creator","administrator"].includes(m.status); } catch { return false; } })();
      if (!isAdm) { await answer(bot, query.id, "Only group admins."); return; }
      await answer(bot, query.id);
      await bot.sendMessage(chatId, `📋 To set group rules, use:\n\n/setrules Your rules here\n\nMembers can view them with /rules`);
      return;
    }

    if (data.startsWith("grp_back_")) {
      const groupChatId = parseInt(data.replace("grp_back_", ""));
      const gs = await GroupSettings.findOne({ chatId: groupChatId });
      if (gs) { const { groupSettingsKeyboard } = await import("../utils/keyboards.js"); try { await bot.editMessageReplyMarkup(groupSettingsKeyboard(gs, groupChatId) as any, { chat_id: query.message!.chat.id, message_id: query.message!.message_id }); } catch {} }
      await answer(bot, query.id);
      return;
    }

    if (data === "grp_settings_close") {
      try { await bot.deleteMessage(query.message!.chat.id, query.message!.message_id); } catch {}
      await answer(bot, query.id);
      return;
    }

    // ── Daily reward claim ────────────────────────────────────────────────

    if (data === "daily_claim") {
      const now = new Date();
      const lastReward = user.lastDailyReward;
      const msIn24h = 24 * 60 * 60 * 1000;
      if (lastReward && now.getTime() - lastReward.getTime() < msIn24h) {
        const hoursLeft = Math.ceil((new Date(lastReward.getTime() + msIn24h).getTime() - now.getTime()) / (60 * 60 * 1000));
        await answer(bot, query.id, `⏳ Already claimed! Come back in ${hoursLeft}h`);
        return;
      }
      const prevStreak = user.streak || 0;
      const wasContinuous = lastReward && (now.getTime() - lastReward.getTime()) < (48 * 60 * 60 * 1000);
      const newStreak = wasContinuous ? prevStreak + 1 : 1;
      user.streak = newStreak;
      user.lastDailyReward = now;
      const streakBonus = Math.min(20, Math.floor(newStreak / 7) * 3);
      const roll = Math.random() * 100;
      let rewardMsg = "";
      if (roll < 3 + streakBonus) {
        const expiry = user.premium.expiresAt && user.premium.expiresAt > now ? user.premium.expiresAt : now;
        user.premium.active = true; user.premium.expiresAt = addDays(expiry, 7);
        user.premium.plan = user.premium.plan || "daily";
        rewardMsg = `🌟 LEGENDARY! You won 7 days of Premium!\n\nKeep your streak going for better odds!`;
      } else if (roll < 15 + streakBonus) {
        const expiry = user.premium.expiresAt && user.premium.expiresAt > now ? user.premium.expiresAt : now;
        user.premium.active = true; user.premium.expiresAt = addDays(expiry, 3);
        user.premium.plan = user.premium.plan || "daily";
        rewardMsg = `💎 RARE! You won 3 days of Premium!\n\nEnjoy unlimited images and priority AI!`;
      } else if (roll < 40 + Math.floor(streakBonus / 2)) {
        user.bonusImages = (user.bonusImages || 0) + 10;
        rewardMsg = `✨ Nice! +10 bonus image slots for today!\n\nGenerate more images than usual today!`;
      } else {
        rewardMsg = `💫 Good job showing up!\n\nNothing special today, but your streak grows. Longer streaks unlock better odds for rare rewards!`;
      }
      await user.save();
      await answer(bot, query.id, "🎁 Reward claimed!");
      await editMsg(bot, query,
        `🎁 Daily Reward — Day ${newStreak}!\n\n` +
        `🔥 Streak: ${newStreak} day${newStreak !== 1 ? 's' : ''}${newStreak >= 7 ? ' 🔥' : ''}\n\n` +
        rewardMsg,
        { inline_keyboard: [
          [{ text: "👥 Refer a Friend", callback_data: "refer_link" }],
          [{ text: "⬅️ Menu", callback_data: "main_menu" }],
        ]}
      );
      return;
    }

    // ── Referral link ─────────────────────────────────────────────────────

    if (data === "refer_link") {
      const { getBotUsername } = await import("../index.js");
      const referralLink = `https://t.me/${getBotUsername()}?start=ref_${user.userId}`;
      const refs = (user.referrals || []).length;
      await editMsg(bot, query,
        `👥 Refer & Earn\n\n` +
        `Share your link — earn Premium for both of you!\n\n` +
        `🔗 Your referral link:\n${referralLink}\n\n` +
        `• New friend gets 3 days Premium 🎁\n` +
        `• You get 7 days Premium 🎉\n` +
        `• Already premium? It extends your time!\n\n` +
        `📊 Total referrals: ${refs} friend${refs !== 1 ? 's' : ''}`,
        { inline_keyboard: [
          [{ text: "🎁 Daily Reward", callback_data: "daily_claim" }],
          [{ text: "⬅️ Menu", callback_data: "main_menu" }],
        ]}
      );
      return;
    }

    // ── Premium Emoji Toggle (owner only) ────────────────────────────────

    if (data === "owner_premoji_on" || data === "owner_premoji_off") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const enable = data === "owner_premoji_on";
      try {
        const { setPremiumEmojiEnabled } = await import("../utils/premiumEmoji.js");
        const config = await getOrCreateBotConfig();
        config.premiumEmojiEnabled = enable;
        await config.save();
        invalidateBotConfigCache();
        setPremiumEmojiEnabled(enable);
        await answer(bot, query.id, enable ? "✨ Premium emoji ON" : "Premium emoji OFF");
        await editMsg(bot, query,
          `✨ Premium Emoji Mode\n━━━━━━━━━━━━━━━━━━━\n` +
          `Status: ${enable ? "✅ ENABLED" : "⛔ DISABLED"}\n\n` +
          (enable
            ? "Nova will now replace basic emoji in AI responses with animated Telegram premium emoji using HTML mode."
            : "Nova will use standard emoji in responses."),
          { inline_keyboard: [
            [{ text: enable ? "⛔ Turn OFF" : "✅ Turn ON", callback_data: enable ? "owner_premoji_off" : "owner_premoji_on" }],
            [{ text: "⬅️ Back to Owner Panel", callback_data: "owner_panel" }],
          ]}
        );
      } catch (err) {
        logger.error({ err }, "Failed to toggle premium emoji");
        await answer(bot, query.id, "Failed to toggle. Try again.");
      }
      return;
    }

    if (data === "owner_premoji_status") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const { isPremiumEmojiEnabled } = await import("../utils/premiumEmoji.js");
      const enabled = isPremiumEmojiEnabled();
      await editMsg(bot, query,
        `✨ Premium Emoji Mode\n━━━━━━━━━━━━━━━━━━━\n` +
        `Status: ${enabled ? "✅ ENABLED" : "⛔ DISABLED"}\n\n` +
        `When enabled: Nova replaces standard emoji (🔥❤️✨💫🎉👍🚀⭐ etc.) with animated Telegram premium emoji in AI responses.\n\n` +
        `Note: Users need Telegram Premium to see them animated; others see the fallback emoji.`,
        { inline_keyboard: [
          [
            { text: "✅ Enable", callback_data: "owner_premoji_on" },
            { text: "⛔ Disable", callback_data: "owner_premoji_off" },
          ],
          [{ text: "⬅️ Back to Owner Panel", callback_data: "owner_panel" }],
        ]}
      );
      return;
    }

    // ── Group: regenerate image with same prompt ──────────────────────────────
    if (data.startsWith("grp_regen:")) {
      const prompt = data.slice("grp_regen:".length).trim();
      const cId = query.message?.chat.id;
      if (!cId || !prompt) { await answer(bot, query.id, "Could not regenerate."); return; }
      await answer(bot, query.id, "🔄 Regenerating...");
      const statusMsg = await bot.sendMessage(cId, `🎨 Regenerating: "${prompt.slice(0, 50)}"...`);
      try {
        const { generateImage } = await import("../services/image.js");
        const buf = await generateImage(prompt);
        try { await bot.deleteMessage(cId, statusMsg.message_id); } catch {}
        if (!buf) { await bot.sendMessage(cId, "Image generation failed. Try again."); return; }
        await bot.sendPhoto(cId, buf, {
          caption: prompt,
          reply_markup: { inline_keyboard: [[{ text: "🔄 Regenerate", callback_data: `grp_regen:${prompt.substring(0, 53)}` }]] },
        });
      } catch {
        try { await bot.deleteMessage(cId, statusMsg.message_id); } catch {}
        await bot.sendMessage(cId, "Image generation failed. Please try again.");
      }
      return;
    }

    // ── Group: pin the current message ───────────────────────────────────────
    if (data === "grp_pin") {
      const cId = query.message?.chat.id;
      const mId = query.message?.message_id;
      if (!cId || !mId) { await answer(bot, query.id, "Could not pin."); return; }
      try {
        await bot.pinChatMessage(cId, mId, { disable_notification: true });
        await answer(bot, query.id, "📌 Pinned!");
      } catch {
        await answer(bot, query.id, "Could not pin — I need admin + pin rights.");
      }
      return;
    }

    if (data === "own_providers") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      await editMsg(bot, query,
        `🔌 Providers\n━━━━━━━━━━━━━━━━\nManage AI provider routing for chat, image, and TTS.`,
        ownerProvidersKeyboard()
      );
      return;
    }

    if (data === "own_features") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const features = config.features;
      await editMsg(bot, query,
        `⚙️ Features\n━━━━━━━━━━━━━━━━\nToggle bot capabilities on or off.`,
        ownerFeaturesKeyboard({
          imageEnabled: features.imageEnabled !== false,
          ttsEnabled: features.ttsEnabled !== false,
          sttEnabled: features.sttEnabled !== false,
          imageAnalysisEnabled: features.imageAnalysisEnabled !== false,
        })
      );
      return;
    }

    if (data === "own_feat_image" || data === "own_feat_tts" || data === "own_feat_stt" || data === "own_feat_imganalyze") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      if (!config.features) config.features = { imageEnabled: true, ttsEnabled: true, sttEnabled: true, imageAnalysisEnabled: true };
      const featureMap: Record<string, keyof typeof config.features> = {
        own_feat_image: "imageEnabled",
        own_feat_tts: "ttsEnabled",
        own_feat_stt: "sttEnabled",
        own_feat_imganalyze: "imageAnalysisEnabled",
      };
      const key = featureMap[data];
      (config.features as any)[key] = !((config.features as any)[key] !== false);
      await config.save();
      invalidateBotConfigCache();
      const val = (config.features as any)[key];
      await answer(bot, query.id, `${val ? "✅ Enabled" : "❌ Disabled"}`);
      await editMsg(bot, query,
        `⚙️ Features\n━━━━━━━━━━━━━━━━\nToggle bot capabilities on or off.`,
        ownerFeaturesKeyboard({
          imageEnabled: config.features.imageEnabled !== false,
          ttsEnabled: config.features.ttsEnabled !== false,
          sttEnabled: config.features.sttEnabled !== false,
          imageAnalysisEnabled: config.features.imageAnalysisEnabled !== false,
        })
      );
      return;
    }

    if (data === "own_chat_providers") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const p = config.providers;
      await editMsg(bot, query,
        `💬 Chat Providers\n━━━━━━━━━━━━━━━━\nChoose which AI provider handles each user type.`,
        ownerChatProvidersKeyboard({
          freeChat:    { provider: p.freeChat.provider,    model: p.freeChat.model    },
          premiumChat: { provider: p.premiumChat.provider, model: p.premiumChat.model },
          groupChat:   { provider: p.groupChat.provider,   model: p.groupChat.model   },
        })
      );
      return;
    }

    if (data === "own_chat_slot_free" || data === "own_chat_slot_premium" || data === "own_chat_slot_group") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const slot = data.replace("own_chat_slot_", "");
      await editMsg(bot, query,
        `💬 Chat Provider — ${slot.charAt(0).toUpperCase() + slot.slice(1)}\n━━━━━━━━━━━━━━━━\nPick the AI provider:`,
        ownerPickChatProviderKeyboard(slot)
      );
      return;
    }

    if (data.startsWith("own_chat_prov_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      // format: own_chat_prov_{slot}_{provider}  e.g. own_chat_prov_free_pollinations
      const withoutPrefix = data.replace("own_chat_prov_", "");
      const slotMatch = withoutPrefix.match(/^(free|premium|group)_(.+)$/);
      if (!slotMatch) { await answer(bot, query.id, "Invalid action."); return; }
      const slot = slotMatch[1] as "free" | "premium" | "group";
      const prov = slotMatch[2] as "pollinations" | "openrouter";
      const config = await getOrCreateBotConfig();
      const slotKey = `${slot}Chat` as "freeChat" | "premiumChat" | "groupChat";
      if (prov === "pollinations") {
        config.providers[slotKey] = { provider: "pollinations", model: "openai" };
        await config.save();
        invalidateBotConfigCache();
        await answer(bot, query.id, "✅ Switched to Pollinations");
        const p = config.providers;
        await editMsg(bot, query,
          `💬 Chat Providers\n━━━━━━━━━━━━━━━━\nUpdated successfully.`,
          ownerChatProvidersKeyboard({
            freeChat:    { provider: p.freeChat.provider,    model: p.freeChat.model    },
            premiumChat: { provider: p.premiumChat.provider, model: p.premiumChat.model },
            groupChat:   { provider: p.groupChat.provider,   model: p.groupChat.model   },
          })
        );
      } else {
        await editMsg(bot, query,
          `💬 Pick OpenRouter Model\n━━━━━━━━━━━━━━━━\nChoose the model to use:`,
          ownerPickOpenRouterModelKeyboard(slot, config.chatModels)
        );
      }
      return;
    }

    if (data.startsWith("own_chat_model_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      // format: own_chat_model_{slot}_{idx}  e.g. own_chat_model_premium_2
      const withoutPrefix = data.replace("own_chat_model_", "");
      const modelMatch = withoutPrefix.match(/^(free|premium|group)_(\d+)$/);
      if (!modelMatch) { await answer(bot, query.id, "Invalid action."); return; }
      const slot = modelMatch[1] as "free" | "premium" | "group";
      const idx = parseInt(modelMatch[2]);
      const config = await getOrCreateBotConfig();
      const model = config.chatModels[idx];
      if (!model) { await answer(bot, query.id, "Model not found."); return; }
      const slotKey = `${slot}Chat` as "freeChat" | "premiumChat" | "groupChat";
      config.providers[slotKey] = { provider: "openrouter", model: model.id };
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ Set to ${model.name}`);
      const p = config.providers;
      await editMsg(bot, query,
        `💬 Chat Providers\n━━━━━━━━━━━━━━━━\nUpdated successfully.`,
        ownerChatProvidersKeyboard({
          freeChat:    { provider: p.freeChat.provider,    model: p.freeChat.model    },
          premiumChat: { provider: p.premiumChat.provider, model: p.premiumChat.model },
          groupChat:   { provider: p.groupChat.provider,   model: p.groupChat.model   },
        })
      );
      return;
    }

    if (data === "own_img_providers") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const p = config.providers;
      await editMsg(bot, query,
        `🖼 Image Providers\n━━━━━━━━━━━━━━━━\nChoose which provider generates images per user type.`,
        ownerImageProvidersKeyboard({
          freeImage: p.freeImage,
          premiumImage: p.premiumImage,
          groupImage: p.groupImage,
        })
      );
      return;
    }

    if (data === "own_img_slot_free" || data === "own_img_slot_premium" || data === "own_img_slot_group") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const slot = data.replace("own_img_slot_", "");
      await editMsg(bot, query,
        `🖼 Image Provider — ${slot.charAt(0).toUpperCase() + slot.slice(1)}\n━━━━━━━━━━━━━━━━\nPick the provider:`,
        ownerPickImageProviderKeyboard(slot)
      );
      return;
    }

    if (data.startsWith("own_img_prov_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      // format: own_img_prov_{slot}_{provider}  e.g. own_img_prov_free_huggingface
      const withoutPrefix = data.replace("own_img_prov_", "");
      const imgMatch = withoutPrefix.match(/^(free|premium|group)_(.+)$/);
      if (!imgMatch) { await answer(bot, query.id, "Invalid action."); return; }
      const slot = imgMatch[1] as "free" | "premium" | "group";
      const prov = imgMatch[2] as "huggingface" | "pollinations";
      const config = await getOrCreateBotConfig();
      const imgKey = `${slot}Image` as "freeImage" | "premiumImage" | "groupImage";
      config.providers[imgKey] = prov;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ Switched to ${prov}`);
      const p = config.providers;
      await editMsg(bot, query,
        `🖼 Image Providers\n━━━━━━━━━━━━━━━━\nUpdated successfully.`,
        ownerImageProvidersKeyboard({
          freeImage: p.freeImage,
          premiumImage: p.premiumImage,
          groupImage: p.groupImage,
        })
      );
      return;
    }

    if (data === "own_tts_provider") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const config = await getOrCreateBotConfig();
      const p = config.providers;
      await editMsg(bot, query,
        `🔊 TTS Provider\n━━━━━━━━━━━━━━━━\nSelect the text-to-speech provider and voice.`,
        ownerTtsKeyboard(p.tts, p.ttsVoice)
      );
      return;
    }

    if (data === "own_tts_prov_huggingface" || data === "own_tts_prov_openrouter") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const prov = data.replace("own_tts_prov_", "") as "huggingface" | "openrouter";
      const config = await getOrCreateBotConfig();
      config.providers.tts = prov;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ TTS set to ${prov}`);
      const p = config.providers;
      await editMsg(bot, query,
        `🔊 TTS Provider\n━━━━━━━━━━━━━━━━\nUpdated.`,
        ownerTtsKeyboard(p.tts, p.ttsVoice)
      );
      return;
    }

    if (data === "own_tts_voice") {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      await editMsg(bot, query,
        `🎙 Pick TTS Voice\n━━━━━━━━━━━━━━━━\nSelect a voice:`,
        ownerPickTtsVoiceKeyboard()
      );
      return;
    }

    if (data.startsWith("own_tts_voice_")) {
      if (!user.isOwner) { await answer(bot, query.id, "Not authorized."); return; }
      const voice = data.replace("own_tts_voice_", "");
      const config = await getOrCreateBotConfig();
      config.providers.ttsVoice = voice;
      await config.save();
      invalidateBotConfigCache();
      await answer(bot, query.id, `✅ Voice set to ${voice}`);
      const p = config.providers;
      await editMsg(bot, query,
        `🔊 TTS Provider\n━━━━━━━━━━━━━━━━\nVoice updated to ${voice}.`,
        ownerTtsKeyboard(p.tts, p.ttsVoice)
      );
      return;
    }

    logger.warn({ data, userId }, "Unknown callback_data received");

  } catch (err) {
    logger.error({ err, data }, "Error in callback handler");
    try {
      await bot.sendMessage(chatId, "Something went wrong, try again later.");
    } catch {}
  }
}
