import TelegramBot from "node-telegram-bot-api";
import { User } from "../models/User.js";
import { Memory } from "../models/Memory.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { chat } from "../services/ai.js";
import { formatDate } from "../utils/helpers.js";
import { getImageLimit } from "../services/image.js";
import { setPending } from "../utils/pendingActions.js";
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
} from "../utils/keyboards.js";
import { logger } from "../../lib/logger.js";

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
  reply_markup?: TelegramBot.InlineKeyboardMarkup
): Promise<void> {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup });
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
      await editMsg(bot, query,
        `Hey ${name}! What would you like to do?\n\nPick a category below:`,
        mainMenuKeyboard()
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
      const badge = user.premium.active ? " (Premium)" : "";
      await editMsg(bot, query,
        `Nova Help${badge}\n\n` +
        `Just type anything to chat with me!\n\n` +
        `Commands:\n` +
        `/image <prompt> — Generate an image\n` +
        `/ask <question> — Quick answer\n` +
        `/translate <text> — Translate to English\n` +
        `/quote — Inspiring quote\n` +
        `/fact — Fun fact\n` +
        `/tip — Productivity tip\n` +
        `/forget — Clear conversation memory\n` +
        `/redeem <code> — Redeem premium code\n\n` +
        `Or just tap the menu buttons — much easier!`,
        backToMainKeyboard()
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
        `Images today: ${user.usage.images}/${getImageLimit(user.premium.active)}\n` +
        `Member since: ${formatDate(user.firstSeen)}`,
        backToSettingsKeyboard()
      );
      return;
    }

    if (data === "settings_premium") {
      const limit = getImageLimit(user.premium.active);
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

    logger.warn({ data, userId }, "Unknown callback_data received");

  } catch (err) {
    logger.error({ err, data }, "Error in callback handler");
    try {
      await bot.sendMessage(chatId, "Something went wrong, try again later.");
    } catch {}
  }
}
