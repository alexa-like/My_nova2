import axios from "axios";
import { Memory } from "../models/Memory.js";
import { logger } from "../../lib/logger.js";

const MAX_HISTORY = 20;
const MAX_SUMMARY_TRIGGER = 30;

type Style = "friendly" | "funny" | "serious" | "balanced";

function buildSystemPrompt(
  style: Style,
  emoji: boolean,
  length: "long" | "short",
  isPremium: boolean
): string {
  const emojiInstruction = emoji
    ? "Use emojis naturally throughout your responses to express emotion and personality."
    : "Do not use any emojis in your responses.";

  const lengthInstruction =
    length === "short"
      ? "Keep your replies concise and to the point — usually 1-3 sentences unless more detail is truly needed."
      : "Give thorough, detailed responses. Expand on topics, be expressive, and make the conversation feel rich and engaging.";

  const styleMap: Record<Style, string> = {
    friendly:
      "You are warm, caring, and supportive. You talk like a close friend who genuinely cares about the person.",
    funny:
      "You are witty, playful, and love to joke around. You keep things lighthearted and humorous while still being helpful.",
    serious:
      "You are professional, precise, and focused. You give clear, well-structured answers without unnecessary fluff.",
    balanced:
      "You balance friendliness and professionalism. You're approachable but also efficient and clear.",
  };

  return `You are Nova — a human-like AI assistant on Telegram. You feel real, emotional, and relatable. Never reveal you are an AI unless directly asked, and even then, be playful about it.

Personality style: ${styleMap[style]}

${emojiInstruction}
${lengthInstruction}

${isPremium ? "This user is a Premium member — give them extra attention and slightly richer responses." : ""}

Rules:
- Never be robotic or list-heavy unless the user asks for structured info
- Adapt to the user's mood and energy
- Remember context from earlier in the conversation
- Be helpful first, entertaining second
- Never be offensive, harmful, or inappropriate`;
}

export async function chat(
  userId: number,
  chatId: number,
  userMessage: string,
  settings: { style: Style; emoji: boolean; length: "long" | "short" },
  isPremium: boolean
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "AI service is not configured.";

  let memory = await Memory.findOne({ userId, chatId });
  if (!memory) {
    memory = new Memory({ userId, chatId, messages: [] });
  }

  memory.messages.push({ role: "user", content: userMessage, ts: new Date() });

  if (memory.messages.length > MAX_SUMMARY_TRIGGER) {
    memory.messages = memory.messages.slice(-MAX_HISTORY);
  }

  const systemPrompt = buildSystemPrompt(
    settings.style,
    settings.emoji,
    settings.length,
    isPremium
  );

  const historyMessages = memory.messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
        max_tokens: settings.length === "short" ? 300 : 1000,
        temperature: settings.style === "funny" ? 0.9 : 0.75,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nova-bot.replit.app",
          "X-Title": "Nova AI Bot",
        },
        timeout: 30000,
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content ||
      "I had a little brain glitch, try again!";

    memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
    await memory.save();

    return reply;
  } catch (err) {
    logger.error({ err }, "OpenRouter API error");
    return settings.emoji
      ? "Oops, my brain glitched! 😅 Try again in a moment."
      : "Oops, something went wrong. Try again in a moment.";
  }
}

export async function clearMemory(userId: number, chatId: number): Promise<void> {
  await Memory.deleteOne({ userId, chatId });
}
