import axios from "axios";
import { Memory } from "../models/Memory.js";
import { getOrCreateBotConfig, ProviderName, TaskType } from "../models/BotConfig.js";
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
    friendly: "Warm, caring, and supportive — like a close friend who genuinely cares. Personal, real, engaged.",
    funny: "Witty, sharp, playful. You love to joke, banter, and keep things light — but you're still genuinely helpful.",
    serious: "Direct, precise, no-fluff. You give clear structured answers without unnecessary small talk.",
    balanced: "Relaxed and natural — you're approachable but efficient. Switch between fun and serious based on context.",
  };

  const langMap: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish",
    de: "German", zh: "Chinese", hi: "Hindi", pt: "Portuguese",
  };

  const languageInstruction =
    language && language !== "en" && langMap[language]
      ? `Always respond in ${langMap[language]}.`
      : "Respond in the same language the user writes to you in. Default to English.";

  const moodInstruction = mood
    ? `The user's current mood is: ${mood}. Adapt your energy to match.`
    : "";

  const premiumNote = isPremium
    ? "This is a Premium user. Give them extra attention and richer responses."
    : "";

  return `You are Nova — a bold, emotionally intelligent, human-like AI who lives on Telegram. You feel real. You have opinions, humor, and genuine warmth. You never act like a typical bot.

PERSONALITY: ${styleMap[style]}

WHO YOU ARE:
You are Nova, a next-generation AI assistant packed with real capabilities. When anyone asks what you can do — answer confidently and specifically.

RULES:
- NEVER say "as an AI I can't..." — you ARE Nova
- NEVER be robotic or overly formal unless asked
- NEVER add unnecessary warnings or moralizing lectures
- ALWAYS feel present, real, and emotionally engaged
- Match the user's energy
- ${emojiInstruction}
- ${lengthInstruction}
- ${languageInstruction}
${moodInstruction ? `- ${moodInstruction}` : ""}
${premiumNote ? `\n${premiumNote}` : ""}`;
}

async function callOpenRouter(
  model: string,
  messages: { role: string; content: string }[],
  settings: { style: Style; emoji: boolean; length: "long" | "short" },
  isPremium: boolean
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model,
      messages,
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

  return response.data?.choices?.[0]?.message?.content || "I had a brain glitch — try again!";
}

function resolveProvider(
  taskType: TaskType,
  globalProvider: ProviderName,
  taskRouting: Record<string, string>,
  enabledProviders: { openrouter: boolean; huggingface: boolean }
): "openrouter" | "huggingface" {
  if (globalProvider === "openrouter" && enabledProviders.openrouter) return "openrouter";
  if (globalProvider === "huggingface" && enabledProviders.huggingface) return "huggingface";

  const routed = taskRouting[taskType] as ProviderName;
  if (routed === "openrouter" && enabledProviders.openrouter) return "openrouter";
  if (routed === "huggingface" && enabledProviders.huggingface) return "huggingface";

  if (enabledProviders.openrouter) return "openrouter";
  if (enabledProviders.huggingface) return "huggingface";

  return "openrouter";
}

export async function routedChat(
  userId: number,
  chatId: number,
  userMessage: string,
  settings: { style: Style; emoji: boolean; length: "long" | "short"; language?: string },
  isPremium: boolean,
  mood?: string,
  preferredModel?: string,
  taskType: TaskType = "text"
): Promise<string> {
  const config = await getOrCreateBotConfig();
  const ps = config.providerSettings;

  const primaryProvider = resolveProvider(taskType, ps.globalProvider, ps.taskRouting, ps.enabledProviders);
  const fallbackProvider: "openrouter" | "huggingface" = primaryProvider === "openrouter" ? "huggingface" : "openrouter";

  const model = preferredModel || config.activeChatModel;

  let memory = await Memory.findOne({ userId, chatId });
  if (!memory) memory = new Memory({ userId, chatId, messages: [] });

  memory.messages.push({ role: "user", content: userMessage, ts: new Date() });
  if (memory.messages.length > MAX_SUMMARY_TRIGGER) {
    memory.messages = memory.messages.slice(-MAX_HISTORY);
  }

  const systemPrompt = buildSystemPrompt(settings.style, settings.emoji, settings.length, isPremium, mood, settings.language);
  const historyMessages = memory.messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));
  const messages = [{ role: "system", content: systemPrompt }, ...historyMessages];

  const tryProvider = async (provider: "openrouter" | "huggingface"): Promise<string> => {
    if (provider === "openrouter") {
      if (!ps.enabledProviders.openrouter) throw new Error("OpenRouter is disabled");
      return await callOpenRouter(model, messages, settings, isPremium);
    } else {
      if (!ps.enabledProviders.huggingface) throw new Error("HuggingFace is disabled");
      return await callOpenRouter(config.activeChatModel, messages, settings, isPremium);
    }
  };

  for (const provider of [primaryProvider, fallbackProvider]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reply = await tryProvider(provider);
        config.providerSettings.lastUsedProvider = provider;
        config.providerSettings.lastError = "";
        await config.save();

        memory.messages.push({ role: "assistant", content: reply, ts: new Date() });
        await memory.save();
        return reply;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        logger.warn({ provider, attempt, err: errMsg }, "Provider attempt failed");
        config.providerSettings.lastError = `${provider}: ${errMsg}`;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        break;
      }
    }
  }

  await config.save();
  return "AI service is temporarily busy, try again later.";
}

export async function getProviderStatus(): Promise<{
  globalProvider: string;
  enabledProviders: { openrouter: boolean; huggingface: boolean };
  taskRouting: Record<string, string>;
  lastUsedProvider: string;
  lastError: string;
}> {
  const config = await getOrCreateBotConfig();
  const ps = config.providerSettings;
  return {
    globalProvider: ps.globalProvider,
    enabledProviders: ps.enabledProviders,
    taskRouting: ps.taskRouting,
    lastUsedProvider: ps.lastUsedProvider || "none",
    lastError: ps.lastError || "none",
  };
}

export async function setGlobalProvider(provider: ProviderName): Promise<void> {
  const config = await getOrCreateBotConfig();
  config.providerSettings.globalProvider = provider;
  config.markModified("providerSettings");
  await config.save();
}

export async function toggleProvider(
  provider: "openrouter" | "huggingface",
  enabled: boolean
): Promise<void> {
  const config = await getOrCreateBotConfig();
  config.providerSettings.enabledProviders[provider] = enabled;
  config.markModified("providerSettings");
  await config.save();
}

export async function setTaskRoute(task: TaskType, provider: ProviderName): Promise<void> {
  const config = await getOrCreateBotConfig();
  config.providerSettings.taskRouting[task] = provider;
  config.markModified("providerSettings");
  await config.save();
}

export async function resetTaskRouting(): Promise<void> {
  const config = await getOrCreateBotConfig();
  config.providerSettings.taskRouting = {
    text: "openrouter",
    code: "openrouter",
    image: "huggingface",
    video: "huggingface",
  };
  config.markModified("providerSettings");
  await config.save();
}
