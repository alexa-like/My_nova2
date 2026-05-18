import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";

// ── Main dashboard ────────────────────────────────────────────────────────────

export function mainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🤖 AI Tools", callback_data: "ai_menu" },
        { text: "🎨 Image Tools", callback_data: "img_menu" },
      ],
      [
        { text: "😄 Fun Menu", callback_data: "fun_menu" },
        { text: "⚙️ Settings", callback_data: "settings_menu" },
      ],
      [
        { text: "📋 Help", callback_data: "show_help" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
    ],
  };
}

export function backToMainKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] };
}

export function backToSettingsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "settings_menu" }]] };
}

// ── Fun menu ──────────────────────────────────────────────────────────────────

export function funMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "😂 Joke", callback_data: "fun_joke" },
        { text: "🎱 8Ball", callback_data: "fun_8ball" },
      ],
      [
        { text: "💘 Ship", callback_data: "fun_ship" },
        { text: "🔥 Roast Me", callback_data: "fun_roast" },
      ],
      [
        { text: "🧠 IQ Test", callback_data: "fun_iq" },
        { text: "🎮 Trivia", callback_data: "fun_game" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── AI tools menu ─────────────────────────────────────────────────────────────

export function aiMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Ask AI", callback_data: "ai_ask" },
        { text: "📝 Summarize Text", callback_data: "ai_summarize" },
      ],
      [
        { text: "🌍 Translate", callback_data: "ai_translate" },
        { text: "✍️ Generate Text", callback_data: "ai_generate" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── Image tools menu ──────────────────────────────────────────────────────────

export function imageMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✨ Generate Image", callback_data: "img_generate" }],
      [
        { text: "✏️ Edit via Prompt", callback_data: "img_edit" },
        { text: "🔆 Enhance", callback_data: "img_enhance" },
      ],
      [
        { text: "🎭 Stylize", callback_data: "img_stylize" },
        { text: "🔧 Restore", callback_data: "img_restore" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── Settings menu ─────────────────────────────────────────────────────────────

export function settingsMenuKeyboard(user: IUser): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "👤 My Profile", callback_data: "settings_profile" },
        {
          text: user.settings.emoji ? "😊 Emojis: ON" : "😑 Emojis: OFF",
          callback_data: user.settings.emoji ? "settings_emoji_off" : "settings_emoji_on",
        },
      ],
      [
        { text: "🎭 AI Style", callback_data: "settings_style" },
        { text: "📏 Reply Length", callback_data: "settings_length" },
      ],
      [
        { text: "🌐 Language", callback_data: "settings_lang" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

export function styleMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  const styles: [string, string][] = [
    ["🤝 Friendly", "friendly"],
    ["😄 Funny", "funny"],
    ["💼 Serious", "serious"],
    ["⚖️ Balanced", "balanced"],
  ];
  return {
    inline_keyboard: [
      ...styles.map(([label, val]) => [{
        text: (val === current ? "✅ " : "") + label,
        callback_data: `settings_style_${val}`,
      }]),
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

export function lengthMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: (current === "short" ? "✅ " : "") + "📌 Short replies", callback_data: "settings_length_short" }],
      [{ text: (current === "long" ? "✅ " : "") + "📖 Long replies", callback_data: "settings_length_long" }],
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

export function langMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  const langs: [string, string][] = [
    ["🇬🇧 English", "en"], ["🇸🇦 Arabic", "ar"],
    ["🇫🇷 French", "fr"], ["🇪🇸 Spanish", "es"],
    ["🇩🇪 German", "de"], ["🇨🇳 Chinese", "zh"],
    ["🇮🇳 Hindi", "hi"], ["🇧🇷 Portuguese", "pt"],
  ];
  return {
    inline_keyboard: [
      ...langs.map(([label, code]) => [{
        text: (code === current ? "✅ " : "") + label,
        callback_data: `settings_lang_${code}`,
      }]),
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

// ── Trivia game ───────────────────────────────────────────────────────────────

export function triviaKeyboard(
  questionIdx: number,
  options: string[],
  correctIdx: number
): TelegramBot.InlineKeyboardMarkup {
  const labels = ["A", "B", "C", "D"];
  return {
    inline_keyboard: [
      ...options.map((opt, i) => [{
        text: `${labels[i]}. ${opt}`,
        callback_data: `game_q${questionIdx}_pick${i}_ans${correctIdx}`,
      }]),
      [{ text: "⬅️ Back", callback_data: "fun_menu" }],
    ],
  };
}
