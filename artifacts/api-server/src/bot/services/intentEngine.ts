/**
 * Intent Engine — classifies natural-language messages into intents.
 * Single source of truth for all intent routing in private and group chats.
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

// ── Image ──────────────────────────────────────────────────────────────────────

const IMAGE_VERBS = "generate|create|make|produce|draw|paint|illustrate|sketch|render|design|show|get|gimme|give me";
const IMAGE_NOUNS = "image|photo|picture|pic|illustration|artwork|drawing|painting|wallpaper|render|poster|portrait|photo";
const IMAGE_PREPS = "of|showing|depicting|about|with|for";

const IMAGE_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  // "generate/draw/make [me] [a/an] image/photo of/with X"
  {
    pattern: new RegExp(`^(?:${IMAGE_VERBS})\\s+(?:me\\s+)?(?:an?\\s+)?(?:${IMAGE_NOUNS})\\s+(?:${IMAGE_PREPS})\\s+(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "generate/draw/make [me] [a/an] image/photo" (no prep — captures everything after noun)
  {
    pattern: new RegExp(`^(?:${IMAGE_VERBS})\\s+(?:me\\s+)?(?:an?\\s+)?(?:${IMAGE_NOUNS})\\s+(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "draw/paint/sketch/illustrate [me] X" — verb implies visual
  {
    pattern: /^(?:draw|paint|illustrate|sketch|render)\s+(?:me\s+)?(?:an?\s+)?(.+)/i,
    extract: (m) => m[1],
  },
  // "show me/give me/gimme a picture/photo/image of X"
  {
    pattern: new RegExp(`^(?:show me|give me|gimme)\\s+(?:an?\\s+)?(?:${IMAGE_NOUNS})\\s+(?:${IMAGE_PREPS})\\s+(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "can you/could you/please generate/draw/create a picture of X"
  {
    pattern: new RegExp(`^(?:can you|could you|please)\\s+(?:${IMAGE_VERBS})\\s+(?:me\\s+)?(?:an?\\s+)?(?:${IMAGE_NOUNS})\\s*(?:${IMAGE_PREPS})?\\s*(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "I want/need a picture/image of X"
  {
    pattern: new RegExp(`^(?:i want|i need|i'd like)\\s+(?:an?\\s+)?(?:${IMAGE_NOUNS})\\s+(?:${IMAGE_PREPS})\\s+(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "picture of X" / "photo of X" (no verb — shorthand)
  {
    pattern: new RegExp(`^(?:${IMAGE_NOUNS})\\s+of\\s+(.+)`, "i"),
    extract: (m) => m[1],
  },
  // "visualize/imagine X"
  {
    pattern: /^(?:visualize|imagine)\s+(.+)/i,
    extract: (m) => m[1],
  },
];

const IMAGE_SKIP = new Set(["me", "that", "this", "one", "some", "it", "anything", "something"]);

export function detectImageIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 3 || t.startsWith("/")) return null;

  for (const { pattern, extract } of IMAGE_PATTERNS) {
    const m = t.match(pattern);
    if (!m) continue;
    const captured = extract(m)?.trim().replace(/[?.!]+$/, "");
    if (captured && captured.length > 1 && !IMAGE_SKIP.has(captured.toLowerCase())) {
      return captured;
    }
  }
  return null;
}

// ── Sticker ────────────────────────────────────────────────────────────────────

const STICKER_PATTERNS: RegExp[] = [
  /^(?:make|create|generate|design)\s+(?:me\s+)?(?:a\s+)?sticker\s+(?:of|showing|with|depicting|about)?\s*(.+)/i,
  /^(?:can you|could you)\s+(?:make|create|design|generate)\s+(?:a\s+)?sticker\s+(?:of|showing|with|for)?\s*(.+)/i,
  /^sticker\s+(?:of\s+|showing\s+|with\s+)?(.+)/i,
  /^i\s+(?:want|need)\s+(?:a\s+)?sticker\s+(?:of|showing|with)?\s*(.+)/i,
];

export function detectStickerIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.startsWith("/")) return null;
  for (const pattern of STICKER_PATTERNS) {
    const m = t.match(pattern);
    const captured = m?.[1]?.trim();
    if (captured && captured.length > 1) return captured.replace(/[?.!]+$/, "");
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
    if (captured && captured.length > 2) return captured.replace(/[?.!]+$/, "");
  }
  return null;
}

// ── Summarize ──────────────────────────────────────────────────────────────────

export function detectSummarizeIntent(text: string): string | null {
  const t = text.trim();
  if (t.length < 10 || t.startsWith("/")) return null;
  const patterns: RegExp[] = [
    /^(?:summarize|summarise|tldr|tl;dr)\s*:?\s*(.+)/i,
    /^(?:sum up|condense|shorten|make shorter)\s+(?:this|the following)\s*:?\s*(.+)/i,
    /^(?:give me a summary of|what(?:'s| is) the (?:summary|gist|main point) of)\s+(.+)/i,
    /^(?:summarize|summarise)\s+this\s+(?:article|text|passage|document)\s*:?\s*(.*)/i,
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    const captured = m?.[1]?.trim();
    if (captured && captured.length > 10) return captured;
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
    // "build/create/make/code/develop/design [me] [a/an] website/app/..."
    /^(?:build|create|make|generate|code|develop|design|write)\s+(?:me\s+)?(?:an?\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|blog|e-?commerce(?:\s*(?:store|shop))?|store|shop|platform|tool|calculator|game|app|application|project|site|page|frontend|backend)\b/i,
    // "I want/need/would like [me] a website/app..."
    /^(?:i want|i need|i'd like|i would like|can you build|can you make|can you create|can you code|can you develop|could you build|could you make|could you create|please build|please make|please create|help me build|help me make|help me create)\s+(?:me\s+)?(?:an?\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio|dashboard|app|application|site|tool|game|calculator|blog|store|shop|platform|project)\b/i,
    // "build/develop [me] a React/Node/HTML app/website"
    /^(?:build|develop|code|create|make|generate)\s+(?:me\s+)?(?:an?\s+)?(?:react|node(?:js|\.js)?|express|fullstack|full.stack|vue|angular|next(?:js|\.js)?|html|css|javascript|js|typescript|ts)\s+(?:app|application|project|website|site|tool|dashboard|page)\b/i,
    // "clone/replicate Netflix/Spotify/..."
    /^(?:clone|make a clone of|build a clone of|create a clone of|replicate)\s+(?:netflix|spotify|twitter|instagram|youtube|airbnb|amazon|reddit|facebook|tiktok|whatsapp|telegram|uber|discord|slack|github|trello|notion|figma)\b/i,
    // generic sentence containing "website/webapp/landing page" keywords
    /^.{0,60}\b(?:website|web\s*app|webapp|landing\s*page|portfolio website|personal site)\b.{0,60}$/i,
    // "build ... website/app for me/my"
    /^(?:build|create|make|generate|code|develop)\s+.{3,80}\s+(?:website|app|application|site|tool|game|dashboard|portfolio|blog|store)\s+for\s+(?:me|my|a)\b/i,
    // standalone type + "website/app"
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
