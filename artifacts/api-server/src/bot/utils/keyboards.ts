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
        { text: "😄 Fun", callback_data: "fun_menu" },
        { text: "🎮 Games", callback_data: "games_menu" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "settings_menu" },
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

export function backToFunKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "fun_menu" }]] };
}

export function backToAiKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "ai_menu" }]] };
}

export function backToImgKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "img_menu" }]] };
}

// ── Fun menu ──────────────────────────────────────────────────────────────────

export function funMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "😂 Joke", callback_data: "fun_joke" },
        { text: "🎱 8-Ball", callback_data: "fun_8ball" },
      ],
      [
        { text: "💘 Ship Us", callback_data: "fun_ship" },
        { text: "🔥 Roast Me", callback_data: "fun_roast" },
      ],
      [
        { text: "🧠 IQ Test", callback_data: "fun_iq" },
        { text: "🌟 Compliment Me", callback_data: "fun_compliment" },
      ],
      [
        { text: "🔮 Fortune", callback_data: "fun_fortune" },
        { text: "😈 Daily Dare", callback_data: "fun_dare" },
      ],
      [
        { text: "✨ Vibe Check", callback_data: "fun_vibe" },
        { text: "💭 Truth", callback_data: "fun_truth" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── Games menu ────────────────────────────────────────────────────────────────

export function gamesMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎯 Trivia Quiz", callback_data: "fun_game" },
        { text: "🤔 Would You Rather", callback_data: "fun_wyr" },
      ],
      [
        { text: "📖 Word of the Day", callback_data: "fun_word" },
        { text: "🎲 Random Fact", callback_data: "fun_fact_game" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── Write for Me menu ─────────────────────────────────────────────────────────

export function writeMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🐦 Tweet", callback_data: "write_tweet" },
        { text: "📸 IG Caption", callback_data: "write_caption" },
      ],
      [
        { text: "👤 Bio", callback_data: "write_bio" },
        { text: "🎵 Song Lyrics", callback_data: "write_lyrics" },
      ],
      [
        { text: "📧 Email", callback_data: "write_email" },
        { text: "🎭 Poem", callback_data: "write_poem" },
      ],
      [{ text: "⬅️ Back", callback_data: "ai_menu" }],
    ],
  };
}

// ── AI tools menu ─────────────────────────────────────────────────────────────

export function aiMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Ask AI", callback_data: "ai_ask" },
        { text: "📝 Summarize", callback_data: "ai_summarize" },
      ],
      [
        { text: "🌍 Translate", callback_data: "ai_translate" },
        { text: "✍️ Write for Me", callback_data: "ai_write" },
      ],
      [
        { text: "🗣️ Debate Me", callback_data: "ai_debate" },
        { text: "🔬 Analyze Text", callback_data: "ai_analyze" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

// ── Image tools menu ──────────────────────────────────────────────────────────

export function imageMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✨ Generate Image", callback_data: "img_generate" },
        { text: "🎨 Style Presets", callback_data: "img_styles" },
      ],
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

// ── Image style presets keyboard ──────────────────────────────────────────────

export function imgStyleKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎌 Anime", callback_data: "img_style_anime" },
        { text: "🤖 Cyberpunk", callback_data: "img_style_cyberpunk" },
      ],
      [
        { text: "🌌 Fantasy", callback_data: "img_style_fantasy" },
        { text: "📸 Realistic", callback_data: "img_style_realistic" },
      ],
      [
        { text: "🎨 Oil Painting", callback_data: "img_style_oil" },
        { text: "💧 Watercolor", callback_data: "img_style_watercolor" },
      ],
      [
        { text: "✏️ Sketch", callback_data: "img_style_sketch" },
        { text: "👾 Pixel Art", callback_data: "img_style_pixel" },
      ],
      [{ text: "⬅️ Back", callback_data: "img_menu" }],
    ],
  };
}

// ── Mood picker keyboard ──────────────────────────────────────────────────────

export function moodPickerKeyboard(current?: string): TelegramBot.InlineKeyboardMarkup {
  const moods: [string, string, string][] = [
    ["😊 Happy", "happy", "mood_set_happy"],
    ["😔 Sad", "sad", "mood_set_sad"],
    ["😤 Stressed", "stressed", "mood_set_stressed"],
    ["😴 Bored", "bored", "mood_set_bored"],
    ["🤩 Excited", "excited", "mood_set_excited"],
    ["🎯 Focused", "focused", "mood_set_focused"],
    ["😍 Romantic", "romantic", "mood_set_romantic"],
    ["😠 Angry", "angry", "mood_set_angry"],
  ];

  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < moods.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, moods.length); j++) {
      const [label, val, cb] = moods[j];
      row.push({ text: (val === current ? "✅ " : "") + label, callback_data: cb });
    }
    rows.push(row);
  }
  rows.push([{ text: "🗑️ Clear Mood", callback_data: "mood_clear" }]);
  rows.push([{ text: "⬅️ Back", callback_data: "settings_menu" }]);

  return { inline_keyboard: rows };
}

// ── Settings menu ─────────────────────────────────────────────────────────────

export function settingsMenuKeyboard(user: IUser): TelegramBot.InlineKeyboardMarkup {
  const moodLabel = user.mood ? `😶 Mood: ${user.mood}` : "😶 Set Mood";
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
        { text: moodLabel, callback_data: "settings_mood" },
      ],
      [
        { text: "🧹 Clear Memory", callback_data: "settings_clear_memory" },
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

// ── Would You Rather keyboard ─────────────────────────────────────────────────

export function wyrKeyboard(idx: number): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🅰️  Option A", callback_data: `wyr_a_${idx}` },
        { text: "🅱️  Option B", callback_data: `wyr_b_${idx}` },
      ],
      [
        { text: "🔀 New Question", callback_data: "fun_wyr" },
        { text: "⬅️ Back", callback_data: "games_menu" },
      ],
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
      [{ text: "⬅️ Back", callback_data: "games_menu" }],
    ],
  };
}
