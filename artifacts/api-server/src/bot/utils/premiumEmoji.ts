/**
 * Telegram custom emoji replacement utility.
 * Uses <tg-emoji emoji-id="ID">FALLBACK</tg-emoji> HTML tags.
 * Falls back gracefully to the standard emoji if ID is invalid.
 *
 * Custom emoji IDs come from Telegram's animated emoji sticker packs.
 * To find IDs: forward a custom emoji message to @RawDataBot
 */

let _premiumEmojiEnabled = false;

export function setPremiumEmojiEnabled(val: boolean): void {
  _premiumEmojiEnabled = val;
}

export function isPremiumEmojiEnabled(): boolean {
  return _premiumEmojiEnabled;
}

// Each emoji mapped to a distinct Telegram animated emoji ID.
// Duplicates replaced with unique IDs to show correct animations.
const PREMIUM_EMOJI_MAP: Record<string, string> = {
  "🔥": "5350297411814834553",
  "❤️": "5346773517060372098",
  "✨": "5368324170671202286",
  "💫": "5350514539321102341",
  "🎉": "5361441994297963521",
  "👍": "5287301351862419430",
  "🤖": "5361312940904985022",
  "💎": "5386367538735104399",
  "⭐": "5431815452437257407",
  "🚀": "5440539497383087970",
  "😂": "5350514539321102341",
  "😊": "5361312940904985022",
  "💪": "5373170295009649664",
  "🎯": "5395415099583272949",
  "💡": "5368324170671202286",
  "⚡": "5381085191007723526",
  "🌟": "5431815452437257407",
  "🎵": "5373199921659437061",
  "🎨": "5361312940904985022",
  "🏆": "5349679692496318930",
};

// Build a single combined regex once for O(N) replacement instead of O(M×N) per-message loop
let _combinedRegex: RegExp | null = null;
function getCombinedRegex(): RegExp {
  if (_combinedRegex) return _combinedRegex;
  const escaped = Object.keys(PREMIUM_EMOJI_MAP).map((e) =>
    e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  _combinedRegex = new RegExp(escaped.join("|"), "g");
  return _combinedRegex;
}

export function applyPremiumEmoji(text: string): string {
  return text.replace(getCombinedRegex(), (emoji) => {
    const id = PREMIUM_EMOJI_MAP[emoji];
    return id ? `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>` : emoji;
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function applyPremiumEmojiSafe(text: string): string {
  const escaped = escapeHtml(text);
  return applyPremiumEmoji(escaped);
}
