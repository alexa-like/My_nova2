/**
 * Intent Engine — classifies natural-language messages into intents.
 * Plugins self-register with pattern matchers; this module dispatches
 * the best-matching plugin. Falls back to AI chat when no plugin matches.
 */

export type IntentType =
  | "image"
  | "music"
  | "sticker"
  | "search"
  | "summarize"
  | "translate"
  | "build"
  | "chat"
  | "clarify";

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  params: Record<string, string>;
  clarificationNeeded?: boolean;
}

type PatternSet = Array<{
  pattern: RegExp;
  extract?: (match: RegExpMatchArray) => string;
}>;

function matchPatterns(text: string, patterns: PatternSet): { prompt: string; confidence: number } | null {
  const t = text.trim();
  for (const { pattern, extract } of patterns) {
    const m = t.match(pattern);
    if (m) {
      const prompt = extract ? (extract(m) || "").trim() : (m[1] || m[0] || "").trim();
      if (prompt.length > 2) return { prompt, confidence: 0.92 };
    }
  }
  return null;
}

// ── Image ──────────────────────────────────────────────────────────────────────
const IMAGE_PATTERNS: PatternSet = [
  { pattern: /^(?:generate|create|make|draw|paint|sketch|render|design|produce)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration|artwork|drawing|painting|wallpaper|poster|art|portrait)\s+(?:of|showing|depicting|about|with|for)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:draw|paint|illustrate|sketch|render|design)\s+(?:me\s+)?(?:an?\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:show me|gimme|give me)\s+(?:an?\s+)?(?:image|photo|picture|pic)\s+(?:of\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:image|photo|picture)\s+(?:of\s+|showing\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:can you|could you|please)\s+(?:generate|create|make|draw|paint|design)\s+(?:an?\s+)?(?:image|photo|picture|illustration|drawing)\s+(?:of|showing|with|about|for)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:i want|i need)\s+(?:an?\s+)?(?:image|photo|picture|illustration)\s+(?:of\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:visualize|imagine)\s+(.+)/i, extract: (m) => m[1] },
];

export function detectImageIntent(text: string): string | null {
  const result = matchPatterns(text.trim(), IMAGE_PATTERNS);
  return result?.prompt ?? null;
}

// ── Music ──────────────────────────────────────────────────────────────────────
const MUSIC_PATTERNS: PatternSet = [
  { pattern: /^(?:generate|create|make|compose|produce|write)\s+(?:some\s+|me\s+|me\s+some\s+)?(?:music|audio|a song|a beat|a track|a melody|a tune)\s*(?:that|with|about|like|for|of)?\s*(.*)/i, extract: (m) => m[1] || m.input || "" },
  { pattern: /^(?:play|make)\s+(?:me\s+)?(?:some\s+)?(?:music|a song|a beat|a track)\s*(?:that|with|about|like|for|of)?\s*(.*)/i, extract: (m) => m[1] || m.input || "" },
  { pattern: /^(?:generate|make|create)\s+(?:a\s+)?(?:lo-?fi|hip-?hop|jazz|classical|ambient|chill|upbeat|epic|sad|happy|calm|relaxing|energetic|electronic|pop|rock)\s+(?:music|beat|track|song|melody|vibe)?\s*(.*)/i, extract: (m) => m[0] },
];

export function detectMusicIntent(text: string): string | null {
  const t = text.trim();
  for (const { pattern } of MUSIC_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      const captured = (m[1] || "").trim();
      const fullPrompt = captured.length > 3 ? captured : t.replace(/^(?:generate|create|make|play|compose|produce|write|i want|i need)\s+(?:me\s+)?(?:some\s+)?/i, "").trim();
      if (fullPrompt.length > 3) return fullPrompt;
    }
  }
  return null;
}

// ── Sticker ────────────────────────────────────────────────────────────────────
const STICKER_PATTERNS: PatternSet = [
  { pattern: /^(?:make|create|generate|design)\s+(?:me\s+)?(?:a\s+)?sticker\s+(?:of|showing|with|depicting|about)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^sticker\s+(?:of\s+|showing\s+|with\s+)?(.+)/i, extract: (m) => m[1] },
];

export function detectStickerIntent(text: string): string | null {
  const result = matchPatterns(text.trim(), STICKER_PATTERNS);
  return result?.prompt ?? null;
}

// ── Web Search ─────────────────────────────────────────────────────────────────
const SEARCH_PATTERNS: PatternSet = [
  { pattern: /^(?:search for|look up|lookup|google|bing|find information about|research)\s+(.+)/i, extract: (m) => m[1] },
  { pattern: /^search\s+(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:find|get)\s+(?:information|info|details|news|facts|data)\s+(?:about|on|regarding)\s+(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:latest|current|recent)\s+(?:news|updates?)\s+(?:about|on|regarding)\s+(.+)/i, extract: (m) => m[1] },
  { pattern: /^what(?:'s| is) (?:the )?(?:latest|current|recent)\s+(?:news|update)\s+(?:about|on)?\s*(.+)/i, extract: (m) => m[1] },
];

export function detectSearchIntent(text: string): string | null {
  const result = matchPatterns(text.trim(), SEARCH_PATTERNS);
  return result?.prompt ?? null;
}

// ── Summarize ──────────────────────────────────────────────────────────────────
const SUMMARIZE_PATTERNS: PatternSet = [
  { pattern: /^(?:summarize|summarise|give me a summary of|tldr|tl;dr)\s*:?\s*(.*)/i, extract: (m) => m[1] },
  { pattern: /^(?:sum up|condense|shorten|make shorter)\s+(?:this|the following)\s*:?\s*(.*)/i, extract: (m) => m[1] },
  { pattern: /^(?:what(?:'s| is) the (?:summary|gist|main point) of)\s+(.+)/i, extract: (m) => m[1] },
  { pattern: /^summarize this article\s*:?\s*(.*)/i, extract: (m) => m[1] },
];

export function detectSummarizeIntent(text: string): string | null {
  const result = matchPatterns(text.trim(), SUMMARIZE_PATTERNS);
  return result?.prompt ?? null;
}

// ── Translate ──────────────────────────────────────────────────────────────────
const TRANSLATE_PATTERNS: PatternSet = [
  { pattern: /^(?:translate|convert)\s+(.+?)(?:\s+(?:to|into|in)\s+(\w+))?\s*$/i, extract: (m) => m[1] },
  { pattern: /^(?:how do you say|what is)\s+(.+?)\s+in\s+(\w+)/i, extract: (m) => m[1] },
  { pattern: /^(?:in|to)\s+(\w+):\s*(.+)/i, extract: (m) => m[2] },
];

export function detectTranslateIntent(text: string): { text: string; targetLang?: string } | null {
  const t = text.trim();
  const m1 = t.match(/^(?:translate|convert)\s+(.+?)\s+(?:to|into|in)\s+(\w+)\s*$/i);
  if (m1) return { text: m1[1], targetLang: m1[2] };
  const m2 = t.match(/^(?:translate|convert)\s+(.+)/i);
  if (m2) return { text: m2[1] };
  const m3 = t.match(/^how do you say\s+(.+?)\s+in\s+(\w+)/i);
  if (m3) return { text: m3[1], targetLang: m3[2] };
  return null;
}

// ── Build ──────────────────────────────────────────────────────────────────────
const BUILD_PATTERNS: PatternSet = [
  { pattern: /^(?:build|create|make|generate|code|develop|design)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:website|web\s*app|webapp|app|application|landing\s*page|portfolio|dashboard|blog|store|shop|platform|tool)\s*(?:for|about|that|with)?\s*(.*)/i, extract: (m) => m[0] },
  { pattern: /^(?:i want|i need)\s+(?:a\s+|an\s+)?(?:website|web\s*app|app|application)\s*(.*)/i, extract: (m) => m[0] },
  { pattern: /^(?:can you|could you)\s+(?:build|create|make|code|develop)\s+(.+)/i, extract: (m) => m[1] },
];

export function detectBuildIntent(text: string): string | null {
  const t = text.trim();
  for (const { pattern } of BUILD_PATTERNS) {
    if (pattern.test(t)) return t;
  }
  return null;
}

// ── Master intent classifier ───────────────────────────────────────────────────
export function classifyIntent(text: string): IntentResult {
  const t = text.trim();

  if (t.startsWith("/") || t.length < 3) {
    return { intent: "chat", confidence: 0.5, params: {} };
  }

  const imagePrompt = detectImageIntent(t);
  if (imagePrompt) return { intent: "image", confidence: 0.92, params: { prompt: imagePrompt } };

  const musicPrompt = detectMusicIntent(t);
  if (musicPrompt) return { intent: "music", confidence: 0.9, params: { prompt: musicPrompt } };

  const stickerPrompt = detectStickerIntent(t);
  if (stickerPrompt) return { intent: "sticker", confidence: 0.9, params: { prompt: stickerPrompt } };

  const searchQuery = detectSearchIntent(t);
  if (searchQuery) return { intent: "search", confidence: 0.88, params: { query: searchQuery } };

  const summarizeText = detectSummarizeIntent(t);
  if (summarizeText !== null) return { intent: "summarize", confidence: 0.88, params: { content: summarizeText } };

  const translateResult = detectTranslateIntent(t);
  if (translateResult) return { intent: "translate", confidence: 0.9, params: { text: translateResult.text, targetLang: translateResult.targetLang || "English" } };

  const buildDesc = detectBuildIntent(t);
  if (buildDesc) return { intent: "build", confidence: 0.88, params: { description: buildDesc } };

  return { intent: "chat", confidence: 0.7, params: {} };
}
