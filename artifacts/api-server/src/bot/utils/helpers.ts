import TelegramBot from "node-telegram-bot-api";

export function isGroup(msg: TelegramBot.Message): boolean {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

export function isPrivate(msg: TelegramBot.Message): boolean {
  return msg.chat.type === "private";
}

export function getUserName(msg: TelegramBot.Message): string {
  const from = msg.from;
  if (!from) return "User";
  return from.first_name || from.username || "User";
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Send a message safely — tries Markdown first, falls back to plain text.
 * Prevents crashes when AI returns unbalanced markdown characters.
 */
export async function safeSend(
  bot: TelegramBot,
  chatId: number,
  text: string,
  extra: TelegramBot.SendMessageOptions = {}
): Promise<void> {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...extra });
  } catch {
    // Markdown failed (unbalanced chars from AI) — send as plain text
    try {
      await bot.sendMessage(chatId, text, extra);
    } catch (err) {
      // Last resort — send a truncated safe version
      await bot.sendMessage(chatId, text.slice(0, 4000).replace(/[*_`[\]()]/g, ""), extra);
    }
  }
}
