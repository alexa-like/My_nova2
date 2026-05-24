/**
 * Intent Engine — classifies natural-language messages into intents.
 * Used by privateHandler for routing; single source of truth for all intent detection.
 */

export type IntentType =
  | "image"
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
  { pattern: /^(?:generate|create|make|produce)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration|artwork|drawing|painting|wallpaper|render|poster)\s+(?:of|showing|depicting|about|with|for)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:draw|paint|illustrate|sketch|render|design)\s+(?:me\s+)?(?:an?\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:show me|gimme|give me)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration)\s+(?:of\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:image|photo|picture)\s+(?:of\s+|showing\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:can you|could you|please)\s+(?:generate|create|make|draw|paint|design)\s+(?:an?\s+)?(?:image|photo|picture|illustration|drawing)\s+(?:of|showing|with|about|for)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:i want|i need)\s+(?:an?\s+)?(?:image|photo|picture|illustration)\s+(?:of\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:visualize|imagine)\s+(.+)/i, extract: (m) => m[1] },
];

const IMAGE_SKIP = new Set(["me", "that", "this", "one", "some", "it", "anything", "something", "a photo", "an image", "sure", "yes"]);

export function detectImageIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  for (const { pattern, extract } of IMAGE_PATTERNS) {
    const m = t.match(pattern);
    const captured = (extract ? extract(m!) : m?.[1])?.trim();
    if (m && captured && captured.length > 3) {
      const prompt = captured.replace(/[?.!]+$/, "");
      if (!IMAGE_SKIP.has(prompt.toLowerCase())) return prompt;
    }
  }
  return null;
}

// ── Sticker ────────────────────────────────────────────────────────────────────
const STICKER_PATTERNS: PatternSet = [
  { pattern: /^(?:make|create|generate|design)\s+(?:me\s+)?(?:a\s+)?sticker\s+(?:of|showing|with|depicting|about)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^(?:can you|could you)\s+(?:make|create|design|generate)\s+(?:a\s+)?sticker\s+(?:of|showing|with|for)?\s*(.+)/i, extract: (m) => m[1] },
  { pattern: /^sticker\s+(?:of\s+|showing\s+|with\s+)?(.+)/i, extract: (m) => m[1] },
  { pattern: /^i\s+(?:want|need)\s+(?:a\s+)?sticker\s+(?:of|showing|with)?\s*(.+)/i, extract: (m) => m[1] },
];

const STICKER_SKIP = new Set(["me", "that", "this", "one", "it", "a sticker"]);

export function detectStickerIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  for (const { pattern, extract } of STICKER_PATTERNS) {
    const m = t.match(pattern);
    const captured = (extract ? extract(m!) : m?.[1])?.trim();
    if (m && captured && captured.length > 3 && !STICKER_SKIP.has(captured.toLowerCase())) {
      return captured.replace(/[?.!]+$/, "");
    }
  }
  return null;
}

// ── Web Search ─────────────────────────────────────────────────────────────────
export function detectSearchIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const patterns: RegExp[] = [
    /^(?:search for|look up|lookup|google|bing|find information about|research)\s+(.+)/i,
    /^search\s+(.+)/i,
    /^(?:find|get)\s+(?:information|info|details|news|facts|data)\s+(?:about|on|regarding)\s+(.+)/i,
    /^(?:what(?:'s| is) the (?:latest|current|recent)\s+(?:news|update|information)\s+(?:about|on|regarding))\s+(.+)/i,
    /^(?:what happened (?:to|with|in))\s+(.+)/i,
    /^(?:tell me (?:the latest|current|recent)\s+(?:news|updates?)\s+(?:about|on))\s+(.+)/i,
    /^(?:latest|current|recent) (?:news|updates?) (?:about|on|regarding) (.+)/i,
    /^(?:latest|recent) (?:news|updates?) (?:on|about)?\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    const captured = m?.[1]?.trim();
    if (m && captured && captured.length > 2) return captured.replace(/[?.!]+$/, "");
  }
  return null;
}

// ── Summarize ──────────────────────────────────────────────────────────────────
export function detectSummarizeIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 10 || t.startsWith("/")) return null;
  const patterns: Array<RegExp> = [
    /^(?:summarize|summarise|tldr|tl;dr)\s*:?\s*(.+)/i,
    /^(?:sum up|condense|shorten|make shorter)\s+(?:this|the following)\s*:?\s*(.+)/i,
    /^(?:give me a summary of|what(?:'s| is) the (?:summary|gist|main point) of)\s+(.+)/i,
    /^(?:summarize|summarise)\s+this\s+(?:article|text|passage|document)\s*:?\s*(.*)/i,
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    const captured = m?.[1]?.trim();
    if (m && captured && captured.length > 10) return captured;
  }
  return null;
}

// ── Translate ──────────────────────────────────────────────────────────────────
export function detectTranslateIntent(text: string): { content: string; targetLang: string } | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  const m1 = t.match(/^(?:translate|convert)\s+(.+?)\s+(?:to|into|in)\s+(\w+)\s*$/i);
  if (m1 && m1[1].length > 2) return { content: m1[1], targetLang: m1[2] };
  const m2 = t.match(/^how do you say\s+(.+?)\s+in\s+(\w+)/i);
  if (m2) return { content: m2[1], targetLang: m2[2] };
  const m3 = t.match(/^(?:in|to)\s+([A-Za-z]+):\s*(.+)/i);
  if (m3 && m3[2].length > 3) return { content: m3[2], targetLang: m3[1] };
  const m4 = t.match(/^translate\s+(?:this\s+)?(?:to|into)\s+(\w+)\s*:?\s*(.*)/i);
  if (m4 && m4[2].length > 3) return { content: m4[2], targetLang: m4[1] };
  const m5 = t.match(/^translate\s+(.+)/i);
  if (m5 && m5[1].length > 2) return { content: m5[1], targetLang: "English" };
  return null;
}

// ── Build ──────────────────────────────────────────────────────────────────────
export function detectBuildIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 8 || t.startsWith("/")) return null;
  const patterns: RegExp[] = [
    /^(?:build|create|make|generate|code|develop|design|write)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|blog|e-?commerce\s*(?:store|shop)?|store|shop|platform|tool|calculator|game|app|application|project|site|page|frontend|backend)\b/i,
    /^(?:i want|i need|i'd like|i would like|can you build|can you make|can you create|can you code|can you develop|could you build|could you make|could you create|please build|please make|please create|help me build|help me make|help me create)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|app|application|site|tool|game|calculator|blog|store|shop|platform|project)\b/i,
    /^(?:build|develop|code|create|make|generate)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:react|node(?:js|\.js)?|express|fullstack|full.stack|vue|angular|next(?:js|\.js)?|html|css|javascript|js|typescript|ts)\s+(?:app|application|project|website|site|tool|dashboard|page)\b/i,
    /^(?:clone|make a clone of|build a clone of|create a clone of|replicate)\s+(?:netflix|spotify|twitter|instagram|youtube|airbnb|amazon|reddit|facebook|tiktok|whatsapp|telegram|uber|discord|slack|github|trello|notion|figma)\b/i,
    /^.{0,60}\b(?:website|web\s*app|webapp|landing\s*page|portfolio website|personal site)\b.{0,60}$/i,
    /^(?:build|create|make|generate|code|develop)\s+.{3,80}\s+(?:website|app|application|site|tool|game|dashboard|portfolio|blog|store)\s+for\s+(?:me|my|a)\b/i,
    /^(?:a\s+)?(?:portfolio|todo|task|weather|calculator|chat|quiz|flashcard|timer|countdown|expense|budget|recipe|fitness|music|photo|gallery|login|signup|landing|e-commerce|shop|store)\s+(?:website|site|app|page|tool|dashboard|tracker)\b/i,
  ];
  for (const pattern of patterns) {
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

  const stickerPrompt = detectStickerIntent(t);
  if (stickerPrompt) return { intent: "sticker", confidence: 0.9, params: { prompt: stickerPrompt } };

  const searchQuery = detectSearchIntent(t);
  if (searchQuery) return { intent: "search", confidence: 0.88, params: { query: searchQuery } };

  const summarizeText = detectSummarizeIntent(t);
  if (summarizeText !== null) return { intent: "summarize", confidence: 0.88, params: { content: summarizeText } };

  const translateResult = detectTranslateIntent(t);
  if (translateResult) return { intent: "translate", confidence: 0.9, params: { text: translateResult.content, targetLang: translateResult.targetLang } };

  const buildDesc = detectBuildIntent(t);
  if (buildDesc) return { intent: "build", confidence: 0.88, params: { description: buildDesc } };

  return { intent: "chat", confidence: 0.7, params: {} };
}
