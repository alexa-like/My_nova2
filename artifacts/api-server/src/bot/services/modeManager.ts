import { User } from "../models/User.js";
import { logger } from "../../lib/logger.js";

export type ModeId =
  | "nova"
  | "none"
  | "image"
  | "sticker"
  | "search"
  | "build"
  | "voice"
  | "translate"
  | "dev"
  | "builder"
  | "creator";

export interface ModeDefinition {
  id: ModeId;
  name: string;
  icon: string;
  description: string;
  activationHint: string;
  premiumOnly?: boolean;
  systemPrompt?: string;
}

export const MODES: ModeDefinition[] = [
  {
    id: "none",
    name: "Normal (Auto)",
    icon: "🔄",
    description: "Default mode — Nova handles everything naturally. Just chat or ask for images, searches, etc.",
    activationHint: "Normal mode active! Just type anything — I'll figure out what you need.",
  },
  {
    id: "nova",
    name: "Nova (Chat)",
    icon: "🤖",
    description: "General AI chat — conversations, questions, advice",
    activationHint: "Nova mode active. Just type anything to chat!",
  },
  {
    id: "image",
    name: "Image Generator",
    icon: "🎨",
    description: "Every message generates an image",
    activationHint: "Image mode active! Describe what you want to see and I'll generate it.",
  },
  {
    id: "sticker",
    name: "Sticker Maker",
    icon: "🖼️",
    description: "Every message creates a sticker",
    activationHint: "Sticker mode active! Describe your sticker and I'll create it.",
  },
  {
    id: "search",
    name: "Web Search",
    icon: "🔍",
    description: "Every message searches the web",
    activationHint: "Search mode active! Type anything to search the web.",
  },
  {
    id: "build",
    name: "App Builder",
    icon: "🌐",
    description: "Every message builds a website or app",
    activationHint: "Build mode active! Describe the website or app you want me to build.",
  },
  {
    id: "voice",
    name: "Text-to-Speech",
    icon: "🔊",
    description: "Every message is converted to audio",
    activationHint: "Voice mode active! Type anything and I'll speak it.",
  },
  {
    id: "translate",
    name: "Translator",
    icon: "🌍",
    description: "Every message gets translated to English",
    activationHint: "Translate mode active! Send any text and I'll translate it to English.",
  },
  {
    id: "dev",
    name: "Dev Mode",
    icon: "💻",
    description: "Expert coding help, debugging & API generation",
    activationHint: "Dev mode active! Ask me anything about code, bugs, APIs, or scripts. I'm your expert developer.",
    premiumOnly: true,
    systemPrompt: "You are an expert senior software engineer. Specialise in clean, production-ready code. For every coding question: provide working code immediately, explain why it works, point out potential bugs, suggest improvements. Languages: TypeScript, Python, JavaScript, Go, Rust, and more. Format all code in proper markdown code blocks.",
  },
  {
    id: "builder",
    name: "Builder Mode",
    icon: "🤖",
    description: "Bot creation, automation & Replit project setup",
    activationHint: "Builder mode active! Tell me what you want to automate, build, or set up. I'll guide you step by step.",
    premiumOnly: true,
    systemPrompt: "You are an expert automation engineer and bot developer. Specialise in Telegram bots, Discord bots, workflow automation, Replit projects, and no-code/low-code tools. For every request: provide a concrete implementation plan, working code snippets, recommended tools and APIs, and deployment guidance. Be practical and action-oriented.",
  },
  {
    id: "creator",
    name: "Creator Mode",
    icon: "✨",
    description: "Content creation, marketing ideas & viral strategies",
    activationHint: "Creator mode active! Give me a topic and I'll generate compelling content, marketing copy, hooks, and ideas.",
    premiumOnly: false,
    systemPrompt: "You are an elite content strategist and creative director. Specialise in viral social media content, marketing copy, YouTube scripts, ad creatives, email campaigns, and brand storytelling. For every request: produce multiple content variations, write engaging hooks, suggest distribution strategies, and think about what makes content shareable. Be creative, punchy, and results-driven.",
  },
];

export function getModeById(id: string): ModeDefinition | undefined {
  return MODES.find((m) => m.id === id);
}

export function getDefaultMode(): ModeDefinition {
  return MODES[0];
}

export function isValidMode(id: string): id is ModeId {
  return MODES.some((m) => m.id === id);
}

// ── In-memory mode cache — 60 s TTL — avoids a DB hit per message ─────────────
interface ModeCache { mode: ModeDefinition; cachedAt: number }
const _modeCache = new Map<number, ModeCache>();
const MODE_CACHE_TTL_MS = 60_000;

// Purge stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - MODE_CACHE_TTL_MS;
  for (const [uid, entry] of _modeCache.entries()) {
    if (entry.cachedAt < cutoff) _modeCache.delete(uid);
  }
}, 5 * 60 * 1000).unref();

export async function getUserMode(userId: number): Promise<ModeDefinition> {
  const cached = _modeCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < MODE_CACHE_TTL_MS) {
    return cached.mode;
  }
  try {
    const user = await User.findOne({ userId }).select("activeMode").lean();
    const modeId = (user as any)?.activeMode;
    const mode = (modeId && isValidMode(modeId)) ? (getModeById(modeId) ?? getDefaultMode()) : getDefaultMode();
    _modeCache.set(userId, { mode, cachedAt: Date.now() });
    return mode;
  } catch (err) {
    logger.warn({ err, userId }, "Failed to get user mode — using default");
    return getDefaultMode();
  }
}

export async function setUserMode(userId: number, modeId: ModeId): Promise<void> {
  try {
    await User.updateOne({ userId }, { activeMode: modeId });
    const mode = getModeById(modeId) ?? getDefaultMode();
    _modeCache.set(userId, { mode, cachedAt: Date.now() });
  } catch (err) {
    logger.error({ err, userId, modeId }, "Failed to set user mode");
  }
}
