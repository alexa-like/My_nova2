import TelegramBot from "node-telegram-bot-api";

// ── Context-aware next-action suggestions ────────────────────────────────────
// After completing a feature, show 2-3 relevant next actions as inline buttons.

type SuggestionRow = TelegramBot.InlineKeyboardButton[];

const SUGGESTION_MAP: Record<string, SuggestionRow[]> = {
  chat: [
    [
      { text: "🔍 Search the Web",  callback_data: "search_btn" },
      { text: "📝 Summarize Text",  callback_data: "ai_summarize" },
      { text: "🌍 Translate",       callback_data: "ai_translate" },
    ],
  ],
  image: [
    [
      { text: "✏️ Edit Image",      callback_data: "img_edit" },
      { text: "✨ Generate Again",  callback_data: "img_generate" },
      { text: "🖼️ Make Sticker",   callback_data: "sticker_btn" },
    ],
  ],
  sticker: [
    [
      { text: "🎨 Generate Image",  callback_data: "img_generate" },
      { text: "🖼️ Another Sticker",callback_data: "sticker_btn" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  build: [
    [
      { text: "🌐 Build Another",   callback_data: "build_menu" },
      { text: "📁 My Projects",     callback_data: "my_projects" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  tts: [
    [
      { text: "🎤 Transcribe Voice",callback_data: "stt_btn" },
      { text: "🔊 Again",          callback_data: "tts_btn" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  stt: [
    [
      { text: "💬 Chat",            callback_data: "ai_ask" },
      { text: "📝 Summarize It",    callback_data: "ai_summarize" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  search: [
    [
      { text: "💬 Ask Nova",        callback_data: "ai_ask" },
      { text: "🔍 Search Again",    callback_data: "search_btn" },
      { text: "📝 Summarize",       callback_data: "ai_summarize" },
    ],
  ],
  translate: [
    [
      { text: "🔊 Read It Aloud",   callback_data: "tts_btn" },
      { text: "🌍 Translate Again", callback_data: "ai_translate" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  summarize: [
    [
      { text: "🌍 Translate It",    callback_data: "ai_translate" },
      { text: "🔊 Read Aloud",      callback_data: "tts_btn" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
  describe: [
    [
      { text: "🎨 Generate Image",  callback_data: "img_generate" },
      { text: "✏️ Edit Image",      callback_data: "img_edit" },
      { text: "⬅️ Menu",            callback_data: "main_menu" },
    ],
  ],
};

const DEFAULT_ROW: SuggestionRow[] = [
  [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
];

/**
 * Returns an InlineKeyboardMarkup with context-relevant next-action buttons.
 * Pass `appendRows` to include extra rows (e.g. a "View on GitHub" URL button).
 */
export function contextSuggestionsKeyboard(
  featureKey: string,
  appendRows: TelegramBot.InlineKeyboardButton[][] = []
): TelegramBot.InlineKeyboardMarkup {
  const rows = SUGGESTION_MAP[featureKey] ?? DEFAULT_ROW;
  return { inline_keyboard: [...appendRows, ...rows] };
}

/**
 * Merge suggestion rows into an existing keyboard (e.g. buildResultKeyboard).
 * Inserts the suggestion row just before the final back row.
 */
export function mergeSuggestions(
  base: TelegramBot.InlineKeyboardMarkup,
  featureKey: string
): TelegramBot.InlineKeyboardMarkup {
  const rows = SUGGESTION_MAP[featureKey];
  if (!rows) return base;
  // Insert before the last row (which is typically the back/menu button)
  const kbd = [...base.inline_keyboard];
  const last = kbd.pop();
  return {
    inline_keyboard: [...kbd, ...rows, ...(last ? [last] : [])],
  };
}
