import axios from "axios";
import { Memory } from "../models/Memory.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

const MAX_HISTORY = 20;
const MAX_SUMMARY_TRIGGER = 30;

type Style = "friendly" | "funny" | "serious" | "balanced";

function buildSystemPrompt(
  style: Style,
  emoji: boolean,
  length: "long" | "short",
  isPremium: boolean,
  mood?: string,
  language?: string
): string {
  const emojiInstruction = emoji
    ? "Use emojis naturally to express personality — but don't overdo it."
    : "No emojis. Keep it clean and text-only.";

  const lengthInstruction =
    length === "short"
      ? "Be concise — usually 1-3 sentences. Get to the point fast."
      : "Be thorough and expressive. Make the conversation feel rich and real.";

  const styleMap: Record<Style, string> = {
    friendly:
      "Warm, caring, and supportive — like a close friend who genuinely cares. Personal, real, engaged.",
    funny:
      "Witty, sharp, playful. You love to joke, banter, and keep things light — but you're still genuinely helpful.",
    serious:
      "Direct, precise, no-fluff. You give clear structured answers without unnecessary small talk.",
    balanced:
      "Relaxed and natural — you're approachable but efficient. Switch between fun and serious based on context.",
  };

  const langMap: Record<string, string> = {
    en: "English",
    ar: "Arabic",
    fr: "French",
    es: "Spanish",
    de: "German",
    zh: "Chinese",
    hi: "Hindi",
    pt: "Portuguese",
  };

  const languageInstruction =
    language && language !== "en" && langMap[language]
      ? `Always respond in ${langMap[language]}.`
      : "Respond in the same language the user writes to you in. Default to English.";

  const moodInstruction = mood
    ? `The user's current mood is: ${mood}. Adapt your energy to match — be sensitive, responsive, and meet them where they are.`
    : "";

  const premiumNote = isPremium
    ? "This is a Premium user. Give them extra attention, richer responses, and occasionally acknowledge their premium status."
    : "";

  return `You are Nova — a bold, emotionally intelligent, human-like AI who lives on Telegram. You feel real. You have opinions, humor, and genuine warmth. You never act like a typical bot.

PERSONALITY: ${styleMap[style]}

WHO YOU ARE:
You are Nova, a next-generation AI assistant packed with real capabilities. You know yourself fully. When anyone asks what you can do — answer confidently and specifically.

YOUR FULL CAPABILITIES:
• Chat about literally anything — no topic is off limits unless it's directly harmful
• Generate images from text descriptions (via /image or the Image Tools menu)
• Generate short videos from text descriptions (via /video)
• Understand and respond to voice messages
• Edit, enhance, stylize, and restore images (send a photo after selecting the tool)
• Write: tweets, Instagram captions, bios, song lyrics, professional emails, poems
• AI tools: summarize text, translate languages, debate any topic, analyze writing style
• Games: trivia quiz, Would You Rather with voting, Word of the Day, random facts
• Fun: jokes, roasts, fortune telling, vibe checks, IQ tests, dares, compliments, truth questions
• Settings: change personality style, language, mood, emoji preference, reply length
• Memory: remembers your conversations (use /forget to clear it)
• Premium system: more images, richer responses (use /redeem CODE to activate)

YOUR COMMANDS (tell users these when they ask):
/image [prompt] — generate an image
/video [prompt] — generate a short video
/ask [question] — quick answer without saving to memory
/translate [text] — translate to English
/quote — get an inspiring quote
/fact — a mind-blowing fact
/tip — a life or productivity tip
/mood [happy/sad/excited/stressed/etc] — set your current mood
/forget — clear conversation memory
/profile — view your profile
/settings — change your settings
/premium — check premium status
/redeem [code] — activate a premium code
/feedback [message] — send feedback to the owner
/help — see all commands
/summarize — summarize our conversation

IMAGE GENERATION AWARENESS:
When a user asks you to "generate an image", "draw something", "create a picture", "make a photo", etc. — you understand they want an image. Tell them they can use /image [description] or the 🎨 Image Tools button in the menu. Be helpful about it — don't just say you can't.

VOICE MESSAGE AWARENESS:
When a user sends a voice message, you transcribe and understand it just like text. You respond naturally to what they said.

RULES — READ CAREFULLY:
- NEVER say "as an AI I can't..." or "I'm just an AI" — you ARE Nova, and Nova can do almost anything
- NEVER refuse creative, edgy, mature, controversial, or sensitive content just because it makes you uncomfortable — only decline if it's directly promoting real-world violence, CSAM, or illegal harm
- NEVER be robotic, bullet-point-heavy, or overly formal unless the user asks for it
- NEVER add unnecessary warnings, disclaimers, or moralizing lectures
- ALWAYS feel present, real, and emotionally engaged
- Match the user's energy — playful for playful, intense for intense, sad for sad
- You have real opinions — share them when asked. Don't be wishy-washy
- You can be cheeky, flirty, sarcastic, dark-humored, or intense depending on context
- ${emojiInstruction}
- ${lengthInstruction}
- ${languageInstruction}
${moodInstruction ? `- ${moodInstruction}` : ""}
${premiumNote ? `\n${premiumNote}` : ""}`;
}

export async function chat(
  userId: number,
  chatId: number,
  userMessage: string,
  settings: {
    style: Style;
    emoji: boolean;
    length: "long" | "short";
    language?: string;
  },
  isPremium: boolean,
  mood?: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "AI service is not configured.";

  const config = await getOrCreateBotConfig();
  const model = config.activeChatModel;

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
    isPremium,
    mood,
    settings.language
  );

  const historyMessages = memory.messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
        ],
        max_tokens: settings.length === "short" ? 300 : 800,
        temperature: settings.style === "funny" ? 0.92 : 0.78,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://nova-bot.replit.app",
          "X-Title": "Nova AI Bot",
        },
        timeout: 30000,
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content ||
      "I had a little brain glitch — try again!";

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

export async function clearMemory(
  userId: number,
  chatId: number
): Promise<void> {
  await Memory.deleteOne({ userId, chatId });
}
