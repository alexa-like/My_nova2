import axios from "axios";
import { Memory } from "../models/Memory.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

const MAX_HISTORY = 20;
const MAX_SUMMARY_TRIGGER = 30;

// ── Free sequential fallback chain (OpenRouter) ───────────────────────────────
const FREE_FALLBACK_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemma-3-12b-it:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "microsoft/phi-4:free",
  "mistralai/mixtral-8x7b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

// ── Premium race pool ─────────────────────────────────────────────────────────
const PREMIUM_RACE_MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-12b-it:free",
  "mistralai/mistral-7b-instruct:free",
];

const PREMIUM_QUALITY_FALLBACKS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "mistralai/mixtral-8x7b-instruct:free",
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
    en: "English", ar: "Arabic", fr: "French", es: "Spanish",
    de: "German", zh: "Chinese", hi: "Hindi", pt: "Portuguese",
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
• Generate images from text — just say "draw X" or "make an image of X" and it happens automatically
• Text-to-speech — use /voice [text] to convert any text to audio
• Voice-to-text — use /listen and send a voice message to get a transcript
• Describe images — use /describe and send a photo for a full AI description
• Create stickers — say "make a sticker of X" and it triggers automatically
• Search the web — say "search for X" or "look up X" for real-time information
• Build complete websites and apps — say /build to get a full project with working code
• Edit, enhance, stylize, and restore images (send a photo after selecting the tool)
• Set reminders — "remind me in 2h to call mom"
• Write: tweets, Instagram captions, bios, song lyrics, emails, poems
• AI tools: summarize text, translate languages, debate topics, analyze writing
• Games: trivia, Would You Rather, Word of the Day, random facts
• Fun: jokes, roasts, fortune telling, vibe checks, IQ tests, dares, compliments
• Settings: personality style, language, mood, emoji preference, reply length
• Memory: remembers conversations (use /forget to clear)
• Premium: more images, richer responses (use /redeem CODE)

YOUR COMMANDS (share these when users ask what you can do):
/image [prompt] — generate an image
/voice [text] — convert text to speech audio
/listen — send a voice message to get a transcript
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
- ${emojiInstruction}
- ${lengthInstruction}
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

// ── Pollinations.ai chat (free, no API key) ───────────────────────────────────
async function callPollinations(
  messages: { role: string; content: string }[],
  model = "openai"
): Promise<string> {
  const seed = Math.floor(Math.random() * 2147483647);
  const response = await axios.post(
    "https://text.pollinations.ai/",
    { model, messages, seed, jsonMode: false },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    }
  );
  const reply =
    typeof response.data === "string"
      ? response.data
      : response.data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty response from Pollinations");
  return reply;
}

// ── Premium fast path ─────────────────────────────────────────────────────────
async function chatPremiumFast(
  apiKey: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const controllers = PREMIUM_RACE_MODELS.map(() => new AbortController());
  const racePromises = PREMIUM_RACE_MODELS.map((model, idx) =>
    callOpenRouter(apiKey, model, messages, maxTokens, temperature, 12000, controllers[idx].signal)
      .then((reply) => {
        controllers.forEach((c, i) => { if (i !== idx) c.abort(); });
        return reply;
      })
  );
  try {
    const reply = await Promise.any(racePromises);
    if (reply) return reply;
  } catch {
    // all 3 fast models failed
  }
  for (const model of PREMIUM_QUALITY_FALLBACKS) {
    try {
      const reply = await callOpenRouter(apiKey, model, messages, maxTokens, temperature, 20000);
      if (reply) return reply;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 402 || status === 429 || status === 500 || status === 503) continue;
      break;
    }
  }
  throw new Error("All premium models failed");
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
  mood?: string,
  preferredModel?: string,
  context?: "free" | "premium" | "group"
): Promise<string> {
  const config = await getOrCreateBotConfig();

  // Determine provider slot based on context
  const effectiveContext = context ?? (isPremium ? "premium" : "free");
  let providerSlot = config.providers?.freeChat ?? { provider: "pollinations", model: "openai" };
  if (effectiveContext === "premium") {
    providerSlot = config.providers?.premiumChat ?? { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" };
  } else if (effectiveContext === "group") {
    providerSlot = config.providers?.groupChat ?? { provider: "pollinations", model: "openai" };
  }

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

  const maxTokens = settings.length === "short" ? 300 : 800;
  const temperature = settings.style === "funny" ? 0.92 : 0.78;

  // ── Pollinations provider path ────────────────────────────────────────────
  if (providerSlot.provider === "pollinations") {
    try {
      const reply = await callPollinations(fullMessages, providerSlot.model || "openai");
      logger.info({ context: effectiveContext }, "Pollinations chat succeeded");
      memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
      await memory.save();
      return reply;
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Pollinations chat failed — falling back to OpenRouter");
      // fall through to OpenRouter
    }
  }

  // ── OpenRouter provider path ──────────────────────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // No OpenRouter key — try Pollinations as final fallback
    try {
      const reply = await callPollinations(fullMessages, "openai");
      memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
      await memory.save();
      return reply;
    } catch {
      return settings.emoji
        ? "AI service is not configured. 😅"
        : "AI service is not configured.";
    }
  }

  // Premium fast path
  if (isPremium && effectiveContext === "premium") {
    try {
      const reply = await chatPremiumFast(apiKey, fullMessages, maxTokens, temperature);
      logger.info("Premium fast chat succeeded");
      memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
      await memory.save();
      return reply;
    } catch {
      logger.warn("Premium fast path failed — falling through to sequential fallback");
    }
  }

  // Sequential fallback (free/group on OpenRouter, or premium last resort)
  const primaryModel = preferredModel || providerSlot.model || config.activeChatModel;
  const modelsToTry = [
    primaryModel,
    ...FREE_FALLBACK_MODELS.filter(m => m !== primaryModel),
  ];

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const reply = await callOpenRouter(apiKey, model, fullMessages, maxTokens, temperature, 25000);
      if (i > 0) {
        logger.info({ primaryModel, usedModel: model }, "Chat fell back to free model successfully");
      }
      memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
      await memory.save();
      return reply;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        logger.error({ model, status }, "OpenRouter auth failed (401) — stopping retries");
        break;
      }
      logger.warn({ model, status, attempt: i + 1 }, "Model failed — trying next fallback");
      continue;
    }
  }

  // Final fallback — try Pollinations
  try {
    const reply = await callPollinations(fullMessages, "openai");
    memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
    await memory.save();
    return reply;
  } catch {}

  return settings.emoji
    ? "Oops, my brain glitched! 😅 Try again in a moment."
    : "Oops, something went wrong. Try again in a moment.";
}

export async function clearMemory(
  userId: number,
  chatId: number
): Promise<void> {
  await Memory.deleteOne({ userId, chatId });
}
