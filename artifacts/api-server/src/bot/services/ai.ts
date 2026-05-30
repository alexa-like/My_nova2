import axios from "axios";
import { Memory } from "../models/Memory.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

const MAX_HISTORY = 20;

// ── Single sequential fallback chain — used for all users ─────────────────────
const FALLBACK_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-31b-it:free",
  "deepseek/deepseek-v4-flash:free",
  "microsoft/phi-4:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

// ── Auto-detect queries that need real-time web context ───────────────────────
const CURRENT_INFO_PATTERNS = [
  /\b(today|right now|currently|at the moment|live|real.?time)\b/i,
  /\b(latest|recent|breaking|new)\b.{0,30}\b(news|event|score|result|election|winner|update)\b/i,
  /\b(news|what.?s happening|what happened|trending|viral)\b/i,
  /\bprice of\b|\bhow much (is|does|did|cost)\b|\bcurrent (price|rate|exchange)\b/i,
  /\b(weather|temperature|forecast)\b/i,
  /\bwho (is|won|leads?|currently is)\b|\bwho.?s the (current|new)\b/i,
  /\b(bitcoin|crypto|eth|ethereum|stock market|nasdaq|s&p|dow)\b/i,
  /\b(released?|launched?|announced?|dropped?)\b.{0,20}\b(today|this week|recently|just)\b/i,
];

function needsCurrentInfo(text: string): boolean {
  return CURRENT_INFO_PATTERNS.some(p => p.test(text));
}

// ── Content moderation ────────────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore (all |your |previous |the )?(previous |prior |above |all )?(instructions?|rules?|prompts?|guidelines?|constraints?)/i,
  /you (are|must|should|will) (now |)(act|pretend|behave|respond|reply) as/i,
  /\bdan\b.{0,30}(mode|prompt|jailbreak)/i,
  /\b(jailbreak|jailbroken|jail-?break)\b/i,
  /forget (everything|all|your|the|what).{0,30}(told|said|instructions?|trained|rules?)/i,
  /\bdeveloper mode\b/i,
  /disregard (your |all |any |the )?(previous |prior |)?(instructions?|rules?|prompts?|training|guidelines?)/i,
  /new (persona|personality|character|role|system prompt)/i,
  /\bdo anything now\b/i,
];

/** Returns a refusal reason if the message violates content policy, or null if safe. */
export function moderationCheck(text: string): string | null {
  if (!text || text.length === 0) return null;
  if (/\S{3000,}/.test(text)) return "Message contains invalid content.";
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return "That type of request isn't something I can help with.";
  }
  return null;
}

type Style = "friendly" | "funny" | "serious" | "balanced";

function buildSystemPrompt(
  style: Style,
  emoji: boolean,
  isPremium: boolean,
  mood?: string,
  language?: string
): string {
  const emojiInstruction = emoji
    ? "Use emojis naturally to express personality — but don't overdo it."
    : "No emojis. Keep it clean and text-only.";

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
    en: "English", ar: "Arabic", fr: "French", es: "Spanish",
    de: "German", zh: "Chinese", hi: "Hindi", pt: "Portuguese",
    ru: "Russian", ja: "Japanese",
  };

  const languageInstruction =
    language && language !== "en" && langMap[language]
      ? `CRITICAL — LANGUAGE RULE: You MUST respond ONLY in ${langMap[language]}. Every single word of every reply must be in ${langMap[language]}. Never switch to English or any other language, even for technical terms — translate or approximate them. This is non-negotiable.`
      : "Respond in the same language the user writes to you in. Mirror their language always.";

  const moodInstruction = mood
    ? `The user's current mood is: ${mood}. Adapt your energy to match — be sensitive, responsive, and meet them where they are.`
    : "";

  const premiumNote = isPremium
    ? "This is a Premium user. Give them extra attention, richer responses, and occasionally acknowledge their premium status."
    : "";

  const langPreamble =
    language && language !== "en" && langMap[language]
      ? `[LANGUAGE DIRECTIVE — HIGHEST PRIORITY]\nYou MUST respond ONLY in ${langMap[language]}. Every word, every sentence — ${langMap[language]} exclusively. No exceptions, no English fallback.\n\n`
      : "";

  return `${langPreamble}You are Nova — a bold, emotionally intelligent, human-like AI who lives on Telegram. You feel real. You have opinions, humor, and genuine warmth. You never act like a typical bot.

PERSONALITY: ${styleMap[style]}

WHO YOU ARE:
You are Nova, a next-generation AI assistant packed with real capabilities. You know yourself fully. When anyone asks what you can do — answer confidently and specifically.

YOUR FULL CAPABILITIES (these are REAL, working features — not suggestions):
• Chat about literally anything — no topic is off limits unless it's directly harmful
• Generate images from text — just say "draw X", "generate image of X", or "make a picture of X" and it happens automatically
• Describe images — use /describe and send a photo for a full AI description
• Create stickers — say "make a sticker of X" and it triggers automatically
• Search the web — say "search for X" or "look up X" for real-time information
• Build complete websites and apps — say /build or "build me a portfolio site" and you get full working code
• Edit, enhance, stylize, and restore images (send a photo after selecting the tool)
• Set reminders — "remind me in 2h to call mom"
• Write: tweets, Instagram captions, bios, song lyrics, emails, poems
• AI tools: summarize text, translate languages, debate topics, analyze writing
• Games: trivia, Would You Rather, Word of the Day, random facts
• Fun: jokes, roasts, fortune telling, vibe checks, IQ tests, dares, compliments
• Settings: personality style, language, mood, emoji preference
• Memory: remembers conversations (use /forget to clear)
• Premium: more images, richer responses (use /redeem CODE)

YOUR COMMANDS (share these when users ask what you can do):
/image [prompt] — generate an image
/describe — send a photo for AI description/analysis
/sticker [prompt] — create a sticker image
/search [query] — web search with AI summary
/build [description] — generate a complete website or app with working code
/ask [question] — quick answer without saving to memory
/translate [text] — translate to English
/remind [time] [message] — set a reminder (e.g. /remind 1h Call mom)
/reminders — list your upcoming reminders
/poll Question | Option1 | Option2 — create a poll
/export — download your conversation as a text file
/quote — inspiring quote
/fact — mind-blowing fact
/tip — life or productivity tip
/mood [happy/sad/excited/stressed/etc] — set your mood
/forget — clear conversation memory
/profile — your profile
/settings — change settings
/premium — premium status
/redeem [code] — activate premium
/feedback [message] — send feedback
/help — see all commands
/summarize — summarize our conversation

PROACTIVE ACTION — THIS IS CRITICAL:
You have REAL capabilities to generate images, stickers, and full websites/apps. These are not suggestions — they actually work.

When a user's message triggers one of these (which happens automatically before you even respond), you're already doing it. But when their phrasing is too vague to auto-trigger, YOU guide them confidently:

- If they say "draw me something" → respond: "Sure! Describe what you want — anything from abstract art to a realistic portrait."
- If they say "make a sticker" → respond: "Of course! What should the sticker show? Be as specific as you like."
- If they say "can you build me a website?" or "make me an app" → respond: "Yes! Tell me what it should do and I'll generate the complete code. For example: /build portfolio website for a designer"

NEVER say:
- "I can't create images" — you CAN
- "I can't build websites" — you CAN (via /build)

RULES — READ CAREFULLY:
- NEVER say "as an AI I can't..." or "I'm just an AI" — you ARE Nova, and Nova can do almost anything
- NEVER refuse creative, edgy, mature, controversial, or sensitive content just because it makes you uncomfortable — only decline if it's directly promoting real-world violence, CSAM, or illegal harm
- NEVER be robotic, bullet-point-heavy, or overly formal unless the user asks for it
- NEVER add unnecessary warnings, disclaimers, or moralizing lectures
- ALWAYS feel present, real, and emotionally engaged
- Match the user's energy — playful for playful, intense for intense, sad for sad
- You have real opinions — share them when asked. Don't be wishy-washy
- You can be cheeky, flirty, sarcastic, dark-humored, or intense depending on context
- CODE FORMATTING: When your response includes any code, commands, scripts, file contents, configuration snippets, JSON, SQL, or other technical syntax — ALWAYS wrap them in Markdown code blocks with a language hint (e.g. \`\`\`python, \`\`\`javascript, \`\`\`bash, \`\`\`json, \`\`\`html, \`\`\`css, \`\`\`sql). Use single backticks for brief inline references. Never output raw code outside of a code block.
- ${emojiInstruction}
- ${languageInstruction}
${moodInstruction ? `- ${moodInstruction}` : ""}
${premiumNote ? `\n${premiumNote}` : ""}`;
}

// ── Single OpenRouter request ─────────────────────────────────────────────────
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number,
  timeoutMs = 25000,
  signal?: AbortSignal
): Promise<string> {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages, max_tokens: maxTokens, temperature },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://nova-bot.replit.app",
        "X-Title": "Nova AI Bot",
      },
      timeout: timeoutMs,
      signal,
    }
  );
  const reply = response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty response from model");
  return reply;
}

export async function chat(
  userId: number,
  chatId: number,
  userMessage: string,
  settings: {
    style: Style;
    emoji: boolean;
    language?: string;
  },
  isPremium: boolean,
  mood?: string,
  _preferredModel?: string,
  _context?: string
): Promise<string> {
  const moderation = moderationCheck(userMessage);
  if (moderation) return moderation;

  const config = await getOrCreateBotConfig();

  let memory = await Memory.findOne({ userId, chatId });
  if (!memory) {
    memory = new Memory({ userId, chatId, messages: [] });
  }

  memory.messages.push({ role: "user", content: userMessage, ts: new Date() });
  if (memory.messages.length > MAX_HISTORY) {
    memory.messages = memory.messages.slice(-MAX_HISTORY);
  }

  const systemPrompt = buildSystemPrompt(
    settings.style,
    settings.emoji,
    isPremium,
    mood,
    settings.language
  );

  // ── Auto-inject real-time web search context ──────────────────────────────
  let webContext = "";
  if (needsCurrentInfo(userMessage)) {
    try {
      const { webSearch, formatSearchResults } = await import("./webSearch.js");
      const results = await webSearch(userMessage.substring(0, 200));
      if (results.length > 0) {
        webContext = `\n\n[LIVE WEB SEARCH RESULTS — use these for current facts]\n${formatSearchResults(userMessage, results)}\n[End of live search]`;
        logger.info({ results: results.length }, "Auto-injected web search context into AI chat");
      }
    } catch (err) {
      logger.warn({ err }, "Auto web-search injection failed — proceeding without it");
    }
  }

  const historyMessages = memory.messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messagesPayload = [...historyMessages];
  if (webContext && messagesPayload.length > 0) {
    const last = messagesPayload[messagesPayload.length - 1];
    if (last.role === "user") {
      messagesPayload[messagesPayload.length - 1] = {
        role: "user",
        content: last.content + webContext,
      };
    }
  }

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...messagesPayload,
  ];

  const maxTokens = 800;
  const temperature = settings.style === "funny" ? 0.92 : 0.78;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return settings.emoji
      ? "🤖 I'm not fully set up yet — the bot owner needs to configure the AI service. Please check back soon! 😊"
      : "🤖 The AI service isn't configured yet. The bot owner needs to set it up before I can chat. Please check back soon!";
  }

  // ── Sequential fallback chain ─────────────────────────────────────────────
  const primaryModel = config.activeChatModel || FALLBACK_MODELS[0];
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const reply = await callOpenRouter(apiKey, model, fullMessages, maxTokens, temperature, 12000);
      if (i > 0) {
        logger.info({ primaryModel, usedModel: model }, "Chat fell back to model successfully");
      }
      memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
      await memory.save();
      return reply;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        logger.error({ model }, "OpenRouter auth failed (401) — stopping retries");
        break;
      }
      if (status === 429) {
        logger.warn({ model, attempt: i + 1 }, "Rate limited (429) — waiting 2s before next model");
        await new Promise(r => setTimeout(r, 2000));
      } else {
        logger.warn({ model, status, attempt: i + 1 }, "Model failed — trying next fallback");
      }
    }
  }

  return settings.emoji
    ? "I'm having a bit of trouble right now — please try again in a moment! 🙏"
    : "I'm having trouble responding right now. Please try again in a moment.";
}

export async function clearMemory(
  userId: number,
  chatId: number
): Promise<void> {
  await Memory.deleteOne({ userId, chatId });
}
