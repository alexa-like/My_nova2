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
 * Keeps the Telegram "typing" or "upload_photo" indicator alive every 4s
 * until the returned stop function is called.
 * Telegram only shows the indicator for ~5s per sendChatAction call, so
 * long-running AI / image requests need this to avoid appearing frozen.
 */
export function startTypingLoop(
  bot: TelegramBot,
  chatId: number,
  action: "typing" | "upload_photo" | "upload_video" = "typing"
): () => void {
  bot.sendChatAction(chatId, action).catch(() => {});
  const interval = setInterval(() => {
    bot.sendChatAction(chatId, action).catch(() => {});
  }, 4000);
  return () => clearInterval(interval);
}

/**
 * Sends a live status message that animates with cycling dots and can be
 * updated to show new text (e.g. "🔄 Trying backup model...").
 * Also keeps the Telegram typing indicator alive.
 *
 * Usage:
 *   const status = await startLiveStatus(bot, chatId, "🔨 Building your website");
 *   status.update("🔄 Trying backup model");
 *   status.stop();
 *   await status.delete();
 */
export async function startLiveStatus(
  bot: TelegramBot,
  chatId: number,
  initialText: string,
  action: "typing" | "upload_photo" | "upload_video" = "typing"
): Promise<{
  update: (text: string) => void;
  stop: () => void;
  msgId: number | null;
  delete: () => Promise<void>;
}> {
  let msgId: number | null = null;
  let currentText = initialText;
  let dotCount = 1;
  let stopped = false;

  try {
    const m = await bot.sendMessage(chatId, initialText + ".");
    msgId = m.message_id;
  } catch {}

  bot.sendChatAction(chatId, action).catch(() => {});

  const interval = setInterval(async () => {
    if (stopped) return;
    bot.sendChatAction(chatId, action).catch(() => {});
    if (msgId) {
      dotCount = (dotCount % 3) + 1;
      const dots = ".".repeat(dotCount);
      try {
        await bot.editMessageText(currentText + dots, {
          chat_id: chatId,
          message_id: msgId,
        });
      } catch {}
    }
  }, 2000);

  return {
    update(text: string) {
      currentText = text;
      dotCount = 1;
      if (msgId && !stopped) {
        bot.editMessageText(text + ".", { chat_id: chatId, message_id: msgId }).catch(() => {});
      }
    },
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    msgId,
    async delete() {
      stopped = true;
      clearInterval(interval);
      if (msgId) {
        try { await bot.deleteMessage(chatId, msgId); } catch {}
      }
    },
  };
}

const MAX_MSG_LEN = 4000;

/**
 * Split a long string into chunks at natural break points (paragraph → line → word).
 * Each chunk is guaranteed to be ≤ maxLen characters.
 */
function splitMessage(text: string, maxLen = MAX_MSG_LEN): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Prefer paragraph break
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.5) {
      // Fall back to newline
      splitAt = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitAt < maxLen * 0.5) {
      // Fall back to word boundary
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt <= 0) {
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Send a message safely — handles Markdown parse errors and splits long messages.
 * Only the final chunk gets the reply_markup so buttons appear once at the end.
 */
export async function safeSend(
  bot: TelegramBot,
  chatId: number,
  text: string,
  extra: TelegramBot.SendMessageOptions = {}
): Promise<void> {
  const chunks = splitMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const chunkExtra = isLast ? extra : { ...extra, reply_markup: undefined };
    const chunk = chunks[i];

    try {
      await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown", ...chunkExtra });
    } catch {
      // Markdown failed (unbalanced chars from AI) — send as plain text
      try {
        await bot.sendMessage(chatId, chunk, chunkExtra);
      } catch {
        // Last resort — strip markdown chars
        await bot.sendMessage(
          chatId,
          chunk.replace(/[*_`[\]()]/g, ""),
          chunkExtra
        ).catch(() => {});
      }
    }
  }
}
