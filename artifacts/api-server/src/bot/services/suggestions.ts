import TelegramBot from "node-telegram-bot-api";

export interface Suggestion {
  text: string;
  callback_data: string;
}

const CONTEXT_SUGGESTIONS: Record<string, Suggestion[]> = {
  image: [
    { text: "🖼️ Create Sticker", callback_data: "sticker_btn" },
    { text: "🎨 Try a Style", callback_data: "img_styles" },
    { text: "✏️ Edit Image", callback_data: "img_edit" },
    { text: "🔄 Generate Again", callback_data: "img_generate" },
  ],
  sticker: [
    { text: "✨ Generate Image", callback_data: "img_generate" },
    { text: "🎨 Image Styles", callback_data: "img_styles" },
    { text: "🖼️ Another Sticker", callback_data: "sticker_btn" },
  ],
  chat: [
    { text: "📝 Summarize", callback_data: "ai_summarize" },
    { text: "🌍 Translate", callback_data: "ai_translate" },
    { text: "✍️ Write for Me", callback_data: "ai_write" },
    { text: "🧹 Clear Memory", callback_data: "forget_memory" },
  ],
  search: [
    { text: "💬 Ask AI", callback_data: "ai_ask" },
    { text: "📝 Summarize", callback_data: "ai_summarize" },
    { text: "🔍 Search Again", callback_data: "search_btn" },
  ],
  build: [
    { text: "🚀 Deploy to Vercel", callback_data: "deploy_live" },
    { text: "📁 My Projects", callback_data: "my_projects" },
    { text: "🌐 Build Another", callback_data: "build_menu" },
  ],
  voice: [
    { text: "🎤 Transcribe Voice", callback_data: "stt_btn" },
    { text: "🔊 Another TTS", callback_data: "tts_btn" },
    { text: "💬 Chat Instead", callback_data: "ai_ask" },
  ],
  summarize: [
    { text: "🌍 Translate", callback_data: "ai_translate" },
    { text: "🗣️ Debate Me", callback_data: "ai_debate" },
    { text: "📤 Export Chat", callback_data: "export_btn" },
  ],
  translate: [
    { text: "📝 Summarize", callback_data: "ai_summarize" },
    { text: "💬 Ask AI", callback_data: "ai_ask" },
    { text: "🌍 Translate Again", callback_data: "ai_translate" },
  ],
  daily: [
    { text: "👥 Refer a Friend", callback_data: "referral_menu" },
    { text: "🏅 Achievements", callback_data: "achievements_menu" },
    { text: "💰 Credits", callback_data: "credits_menu" },
  ],
};

export function getSuggestionsKeyboard(
  context: string,
  maxSuggestions = 3
): TelegramBot.InlineKeyboardMarkup | undefined {
  const suggestions = CONTEXT_SUGGESTIONS[context];
  if (!suggestions || suggestions.length === 0) return undefined;

  const limited = suggestions.slice(0, maxSuggestions);
  const rows: TelegramBot.InlineKeyboardButton[][] = [];

  for (let i = 0; i < limited.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, limited.length); j++) {
      row.push({ text: limited[j].text, callback_data: limited[j].callback_data });
    }
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Menu", callback_data: "main_menu" }]);

  return { inline_keyboard: rows };
}

export function getSuggestionLine(context: string): string {
  const hints: Record<string, string> = {
    image:     "💡 Try a style, create a sticker, or generate another image:",
    sticker:   "💡 Want to make another or try a full image?",
    chat:      "💡 What would you like to do next?",
    search:    "💡 Want to dig deeper or ask follow-up questions?",
    build:     "💡 Deploy your project or start a new one:",
    voice:     "💡 Try transcribing a voice message or chat instead:",
    summarize: "💡 Want to translate or export this?",
    translate: "💡 Summarize or ask follow-up questions:",
    daily:     "💡 Keep the momentum going:",
  };
  return hints[context] ?? "💡 What's next?";
}
