import TelegramBot from "node-telegram-bot-api";
import { chat } from "../services/ai.js";
import { logger } from "../../lib/logger.js";

const IMAGE_KEYWORDS = /^(image|img|photo|picture|draw|generate|create|imagine)\s+/i;

/**
 * Inline query handler.
 * Users type @Novabyolabot <query> in any chat.
 *
 * - Query starting with "image/img/draw/..." → suggest image generation in DM
 * - Everything else → AI response as inline article
 */
export async function handleInlineQuery(
  bot: TelegramBot,
  query: TelegramBot.InlineQuery
): Promise<void> {
  const text = query.query.trim();

  if (!text || text.length < 2) {
    // Show usage hints when query is empty
    try {
      await bot.answerInlineQuery(query.id, [
        {
          type: "article",
          id: "hint_chat",
          title: "💬 Ask Nova anything...",
          description: "Type your question and Nova will answer it",
          input_message_content: {
            message_text: "Please type your question after @Novabyolabot",
          },
        },
        {
          type: "article",
          id: "hint_image",
          title: "🎨 Generate an image...",
          description: 'Type "image a sunset over mountains" to generate',
          input_message_content: {
            message_text: 'Type: @Novabyolabot image <your description>',
          },
        },
      ], { cache_time: 10 });
    } catch {}
    return;
  }

  // Image generation request → redirect to DM since generation takes too long for inline
  if (IMAGE_KEYWORDS.test(text)) {
    const prompt = text.replace(IMAGE_KEYWORDS, "").trim();
    const botUsername = (await bot.getMe()).username;
    try {
      await bot.answerInlineQuery(query.id, [
        {
          type: "article",
          id: "image_redirect",
          title: `🎨 Generate: "${prompt.slice(0, 50)}"`,
          description: "Tap to send this image request to Nova in your DM",
          input_message_content: {
            message_text: `🎨 Image request: ${prompt}\n\nOpen @${botUsername} and send:\n/image ${prompt}`,
          },
          thumb_url: "https://img.icons8.com/fluency/96/image.png",
        },
      ], { cache_time: 0 });
    } catch (err) {
      logger.error({ err }, "Inline image redirect failed");
    }
    return;
  }

  // AI chat inline — generate a response
  const userId = query.from.id;
  try {
    const reply = await chat(
      userId,
      userId, // use userId as chatId for inline (separate context)
      text,
      { style: "balanced", emoji: true },
      false
    );

    const truncated = reply.length > 4096 ? reply.slice(0, 4090) + "..." : reply;

    await bot.answerInlineQuery(query.id, [
      {
        type: "article",
        id: "nova_reply",
        title: "Nova says...",
        description: truncated.slice(0, 100),
        input_message_content: {
          message_text: truncated,
          parse_mode: "Markdown",
        },
        thumb_url: "https://img.icons8.com/fluency/96/bot.png",
      },
    ], { cache_time: 30 });
  } catch (err) {
    logger.error({ err }, "Inline AI query failed");
    try {
      await bot.answerInlineQuery(query.id, [
        {
          type: "article",
          id: "error",
          title: "Nova is thinking... 🤔",
          description: "Try again in a moment",
          input_message_content: {
            message_text: "Nova is currently busy. Try again shortly!",
          },
        },
      ], { cache_time: 5 });
    } catch {}
  }
}
