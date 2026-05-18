import TelegramBot from "node-telegram-bot-api";
import { User } from "../models/User.js";
import { GroupSettings } from "../models/GroupSettings.js";
import { chat } from "../services/ai.js";
import { formatDate } from "../utils/helpers.js";
import { getImageLimit } from "../services/image.js";
import { setPending } from "../utils/pendingActions.js";
import {
  mainMenuKeyboard,
  funMenuKeyboard,
  aiMenuKeyboard,
  imageMenuKeyboard,
  settingsMenuKeyboard,
  styleMenuKeyboard,
  lengthMenuKeyboard,
  langMenuKeyboard,
  backToMainKeyboard,
  backToSettingsKeyboard,
  triviaKeyboard,
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

    // ── Navigation ─────────────────────────────────────────────────────────

    if (data === "main_menu" || data === "back_main") {
      const name = user.firstName || user.username || "there";
      await editMsg(bot, query,
        `Hey ${name}! What would you like to do?\n\nPick a category below:`,
        mainMenuKeyboard()
      );
      return;
    }

    if (data === "fun_menu") {
      await editMsg(bot, query,
        "Fun Menu\n\nPick something fun to do:",
        funMenuKeyboard()
      );
      return;
    }

    if (data === "ai_menu") {
      await editMsg(bot, query,
        "AI Tools\n\nWhat do you need help with?",
        aiMenuKeyboard()
      );
      return;
    }

    if (data === "img_menu") {
      await editMsg(bot, query,
        "Image Tools\n\nGenerate or transform images:\n\nFor editing tools, send me a photo after selecting one.",
        imageMenuKeyboard()
      );
      return;
    }

    if (data === "settings_menu") {
      const freshUser = await User.findOne({ userId });
      if (!freshUser) return;
      await editMsg(bot, query,
        `Your Settings\n\nStyle: ${freshUser.settings.style}\nLanguage: ${freshUser.settings.language || "en"}\nEmojis: ${freshUser.settings.emoji ? "On" : "Off"}\nLength: ${freshUser.settings.length}`,
        settingsMenuKeyboard(freshUser)
      );
      return;
    }

    if (data === "show_help") {
      const badge = user.premium.active ? " (Premium)" : "";
      await editMsg(bot, query,
        `Nova Help${badge}\n\n` +
        `Just type anything to chat with Nova!\n\n` +
        `Commands:\n` +
        `/image <prompt> — Generate an image\n` +
        `/ask <question> — Quick answer\n` +
        `/translate <text> — Translate to English\n` +
        `/quote — Inspiring quote\n` +
        `/fact — Fun fact\n` +
        `/tip — Productivity tip\n` +
        `/forget — Clear memory\n` +
        `/redeem <code> — Redeem premium code\n\n` +
        `Or use the menu buttons below for everything else!`,
        backToMainKeyboard()
      );
      return;
    }

    // ── Fun Module ─────────────────────────────────────────────────────────

    if (data === "fun_joke") {
      await editMsg(bot, query, "Thinking of a good one...");
      const joke = await chat(userId, chatId + 7001, "Tell me one short, clever, clean joke. Just the joke, no intro.", { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `Joke\n\n${joke}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_8ball") {
      setPending(userId, "fun_8ball");
      await editMsg(bot, query,
        "Magic 8-Ball\n\nType your yes/no question and I'll consult the universe...",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "fun_ship") {
      setPending(userId, "fun_ship");
      await editMsg(bot, query,
        "Compatibility Ship\n\nSend two names separated by a space:\nExample: John Sarah",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "fun_roast") {
      setPending(userId, "fun_roast_name");
      await editMsg(bot, query,
        "Roast Generator\n\nType your name (or anyone's name) and I'll roast them — all in good fun!",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "fun_iq") {
      await editMsg(bot, query, "Calculating your IQ...");
      const name = user.firstName || user.username || "you";
      const iqPrompt = `Give ${name} a funny, creative, fictional IQ test result. Make up a score between 60 and 160 and give a humorous personality description for that score. Keep it light and fun, 3-4 sentences.`;
      const result = await chat(userId, chatId + 7002, iqPrompt, { style: "funny", emoji: e, length: "short" }, user.premium.active);
      await editMsg(bot, query, `IQ Test Results\n\n${result}`, funMenuKeyboard());
      return;
    }

    if (data === "fun_game") {
      const idx = Math.floor(Math.random() * TRIVIA.length);
      const q = TRIVIA[idx];
      await editMsg(bot, query,
        `Trivia Time!\n\nQuestion:\n${q.q}`,
        triviaKeyboard(idx, q.opts, q.ans)
      );
      return;
    }

    // Trivia answer: format game_q{idx}_pick{picked}_ans{correct}
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
            `Trivia\n\nCorrect! Well done!\n\nQuestion: ${q.q}\nAnswer: ${labels[correct]}. ${q.opts[correct]}`,
            funMenuKeyboard()
          );
        } else {
          await editMsg(bot, query,
            `Trivia\n\nWrong! Better luck next time.\n\nQuestion: ${q.q}\nCorrect answer: ${labels[correct]}. ${q.opts[correct]}\nYou picked: ${labels[picked]}. ${q.opts[picked]}`,
            funMenuKeyboard()
          );
        }
      }
      return;
    }

    // ── AI Module ─────────────────────────────────────────────────────────

    if (data === "ai_ask") {
      setPending(userId, "ai_ask");
      await editMsg(bot, query,
        "Ask AI\n\nType your question and I'll answer it right away:",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "ai_summarize") {
      setPending(userId, "ai_summarize_input");
      await editMsg(bot, query,
        "Summarize Text\n\nPaste or type the text you want summarized:",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "ai_translate") {
      setPending(userId, "ai_translate");
      await editMsg(bot, query,
        "Translate\n\nType or paste the text you want translated to English:",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "ai_generate") {
      setPending(userId, "ai_generate");
      await editMsg(bot, query,
        "Generate Text\n\nDescribe what you want me to write:\nExample: a short poem about the sea, a product description for headphones",
        backToMainKeyboard()
      );
      return;
    }

    // ── Image Module ──────────────────────────────────────────────────────

    if (data === "img_generate") {
      setPending(userId, "img_generate_text");
      await editMsg(bot, query,
        "Generate Image\n\nDescribe what you want to see:\nExample: a futuristic city at sunset",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "img_edit") {
      setPending(userId, "img_edit");
      await editMsg(bot, query,
        "Edit Image\n\nSend me a photo with a caption describing what to change.\nExample: (send photo) caption: make it look like a painting",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "img_enhance") {
      setPending(userId, "img_enhance");
      await editMsg(bot, query,
        "Enhance Image\n\nSend me a photo and I'll create an enhanced, high-quality version of it:",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "img_stylize") {
      setPending(userId, "img_stylize");
      await editMsg(bot, query,
        "Stylize Image\n\nSend me a photo with a caption describing the style.\nExample: (send photo) caption: anime style, oil painting, cyberpunk",
        backToMainKeyboard()
      );
      return;
    }

    if (data === "img_restore") {
      setPending(userId, "img_restore");
      await editMsg(bot, query,
        "Restore Image\n\nSend me an old or damaged photo and I'll generate a clean, restored version:",
        backToMainKeyboard()
      );
      return;
    }

    // ── Settings Module ───────────────────────────────────────────────────

    if (data === "settings_profile") {
      const premiumLine = user.premium.active
        ? `Premium — expires ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}`
        : "Free";
      await editMsg(bot, query,
        `Your Profile\n\n` +
        `Name: ${user.firstName || "N/A"}\n` +
        `Username: ${user.username ? "@" + user.username : "N/A"}\n` +
        `ID: ${user.userId}\n` +
        `Status: ${premiumLine}\n` +
        `Style: ${user.settings.style}\n` +
        `Language: ${user.settings.language || "en"}\n` +
        `Mood: ${user.mood || "Not set"}\n` +
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
          `Premium Member\n\n` +
          `Expires: ${user.premium.expiresAt ? formatDate(user.premium.expiresAt) : "Never"}\n\n` +
          `Perks:\n` +
          `- ${limit} images per day\n` +
          `- Longer AI context\n` +
          `- Richer responses`,
          backToMainKeyboard()
        );
      } else {
        await editMsg(bot, query,
          `Free Plan\n\n` +
          `Limits:\n` +
          `- ${limit} images per day\n` +
          `- Standard AI responses\n\n` +
          `To upgrade, use: /redeem CODE\n` +
          `Contact the bot owner for a premium code.`,
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
        `Emojis turned ON!\n\nStyle: ${user.settings.style}\nLanguage: ${user.settings.language || "en"}\nEmojis: On\nLength: ${user.settings.length}`,
        settingsMenuKeyboard(freshUser!)
      );
      return;
    }

    if (data === "settings_emoji_off") {
      user.settings.emoji = false;
      await user.save();
      const freshUser = await User.findOne({ userId });
      await editMsg(bot, query,
        `Emojis turned OFF.\n\nStyle: ${user.settings.style}\nLanguage: ${user.settings.language || "en"}\nEmojis: Off\nLength: ${user.settings.length}`,
        settingsMenuKeyboard(freshUser!)
      );
      return;
    }

    if (data === "settings_style") {
      await editMsg(bot, query,
        `AI Style\n\nCurrent: ${user.settings.style}\n\nChoose your preferred personality:`,
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
        `Style updated to: ${newStyle}\n\nPick another or go back:`,
        styleMenuKeyboard(newStyle)
      );
      return;
    }

    if (data === "settings_length") {
      await editMsg(bot, query,
        `Reply Length\n\nCurrent: ${user.settings.length}\n\nChoose how long you want Nova's replies:`,
        lengthMenuKeyboard(user.settings.length)
      );
      return;
    }

    if (data === "settings_length_short") {
      user.settings.length = "short";
      await user.save();
      await editMsg(bot, query, "Reply length set to Short.", lengthMenuKeyboard("short"));
      return;
    }

    if (data === "settings_length_long") {
      user.settings.length = "long";
      await user.save();
      await editMsg(bot, query, "Reply length set to Long.", lengthMenuKeyboard("long"));
      return;
    }

    if (data === "settings_lang") {
      await editMsg(bot, query,
        `Language\n\nCurrent: ${user.settings.language || "en"}\n\nChoose your preferred language:`,
        langMenuKeyboard(user.settings.language || "en")
      );
      return;
    }

    if (data.startsWith("settings_lang_")) {
      const code = data.replace("settings_lang_", "");
      user.settings.language = code;
      await user.save();
      await editMsg(bot, query, `Language set to: ${code}`, langMenuKeyboard(code));
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
        `Use these commands in your group:\n\n` +
        `Moderation:\n` +
        `/ban — Ban a user\n` +
        `/unban — Unban a user\n` +
        `/mute [1m|1h|1d] — Mute a user\n` +
        `/unmute — Unmute a user\n` +
        `/warn [reason] — Warn a user\n` +
        `/kick — Kick a user\n\n` +
        `Management:\n` +
        `/lock / /unlock — Lock or unlock group\n` +
        `/purge <n> — Delete last N messages\n` +
        `/messageall <text> — DM all members\n` +
        `/poll Q|A|B|C — Create a poll\n\n` +
        `Bot Stats:\n` +
        `Total users: ${totalUsers}\n` +
        `Premium: ${premiumUsers}\n` +
        `Banned: ${bannedUsers}\n` +
        `Active groups: ${totalGroups}`,
        backToMainKeyboard()
      );
      return;
    }

    // Fallback for unknown callbacks
    logger.warn({ data, userId }, "Unknown callback_data received");

  } catch (err) {
    logger.error({ err, data }, "Error in callback handler");
    try {
      await bot.sendMessage(chatId, "Something went wrong, try again later.");
    } catch {}
  }
}
