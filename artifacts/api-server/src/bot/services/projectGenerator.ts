import axios from "axios";
import { jsonrepair } from "jsonrepair";
import { logger } from "../../lib/logger.js";

export type ProjectType = "static" | "react" | "nodejs" | "fullstack";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface GeneratedProject {
  name: string;
  description: string;
  type: ProjectType;
  files: ProjectFile[];
  deploymentTip: string;
}

// ── Known-good free models on OpenRouter, in priority order ───────────────────
// These are tried in sequence until one succeeds.
const FREE_MODEL_QUEUE = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-2-9b-it:free",
  "microsoft/phi-4:free",
  "mistralai/mistral-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

// ── Validate that a model ID looks real (not "Openrouter/free" etc.) ─────────
function isValidModelId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  if (!id.includes("/")) return false;
  if (id.toLowerCase() === "openrouter/free") return false;
  if (id.toLowerCase().startsWith("openrouter/")) return false;
  if (id.length < 5) return false;
  return true;
}

// ── Build model queue: config model first (if valid), then hardcoded fallbacks ─
async function buildModelQueue(): Promise<string[]> {
  try {
    const { getOrCreateBotConfig } = await import("../models/BotConfig.js");
    const cfg = await getOrCreateBotConfig();
    const configModel = cfg.activeCodeModel;
    if (isValidModelId(configModel) && !FREE_MODEL_QUEUE.includes(configModel)) {
      return [configModel, ...FREE_MODEL_QUEUE];
    }
    if (isValidModelId(configModel)) {
      // Move config model to the front of the standard queue
      return [configModel, ...FREE_MODEL_QUEUE.filter(m => m !== configModel)];
    }
  } catch {}
  return [...FREE_MODEL_QUEUE];
}

// ── Prompt engineering ─────────────────────────────────────────────────────────

function buildPrompt(userRequest: string): string {
  return `Generate a complete, production-ready web project for: "${userRequest}"

CRITICAL: Respond with ONLY a raw JSON object. No markdown fences, no explanation, no \`\`\`json. Just the JSON.

Required JSON shape:
{
  "name": "kebab-case-repo-name",
  "description": "One clear sentence about the project",
  "type": "static",
  "deploymentTip": "Specific deployment instructions",
  "files": [
    { "path": "index.html", "content": "...full content..." },
    { "path": "style.css", "content": "...full content..." },
    { "path": "script.js", "content": "...full content..." },
    { "path": "README.md", "content": "...full content..." }
  ]
}

PROJECT TYPE GUIDE:
- "static": pure HTML + CSS + vanilla JS. For portfolios, landing pages, calculators, clocks, games, simple tools.
- "react": React 18 + Babel via CDN. For dashboards, SPAs, interactive apps. All in one index.html.
- "nodejs": Express + plain HTML frontend. For chat apps, REST APIs, real-time features.
- "fullstack": Express + in-memory store + frontend. For complex apps needing persistence.

QUALITY RULES:
1. COMPLETE, WORKING code — no TODOs, no placeholders
2. Modern design: CSS variables, flexbox/grid, smooth transitions
3. Mobile-responsive
4. Realistic sample content (not Lorem Ipsum)
5. Dark mode preferred for dashboards
6. Maximum 8 files total

deploymentTip examples:
- static: "Deploy free on Netlify: drag folder to app.netlify.com/drop"
- react: "Deploy on Vercel: import from GitHub at vercel.com/new"
- nodejs: "Deploy on Render: push to GitHub then connect at render.com"`;
}

// ── JSON extraction ────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  let text = raw.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error("JSON not closed");
  return text.slice(start, end + 1);
}

// ── File sanitiser ─────────────────────────────────────────────────────────────

function sanitiseFiles(files: any[]): ProjectFile[] {
  return files
    .filter(f => f && typeof f.path === "string" && typeof f.content === "string")
    .map(f => ({
      path: f.path
        .replace(/\\/g, "/").replace(/^\/+/, "")
        .replace(/[<>:"|?*\x00-\x1f]/g, "")
        .replace(/\.{2,}/g, ".").replace(/\/\.+\//g, "/")
        .replace(/\/+/g, "/").replace(/^\.+\//, "")
        .slice(0, 255),
      content: typeof f.content === "string" ? f.content : JSON.stringify(f.content, null, 2),
    }))
    .filter(f => f.path.length > 0 && f.content.length > 0 && !f.path.startsWith("."));
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateProject(
  userRequest: string,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<GeneratedProject> {
  logger.info({ userRequest }, "Generating project");

  const modelQueue = await buildModelQueue();
  const prompt = buildPrompt(userRequest);

  for (let i = 0; i < modelQueue.length; i++) {
    const model = modelQueue[i];
    let raw = "";

    try {
      if (i === 0) {
        onStatus?.("🔨 Building your project...");
      } else {
        onStatus?.(`⏳ Trying another model...`);
      }
      logger.info({ model, attempt: i }, "Attempting project generation");

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [
            {
              role: "system",
              content: "You are an expert full-stack web developer. Output ONLY raw JSON — no markdown, no explanation.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 8192,
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL || "https://nova-bot.replit.app",
            "X-Title": "Nova AI Bot",
          },
          timeout: 120000,
        }
      );
      raw = response.data?.choices?.[0]?.message?.content || "";

    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 401) {
        throw new Error("❌ API key rejected. Ask the bot owner to check the OpenRouter key.");
      }

      if (status === 429) {
        // Rate limited — wait briefly then try next model
        logger.warn({ model, status: 429 }, "Rate limited — skipping to next model");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      if (status === 402) {
        // Payment required — model not available on free tier, skip
        logger.warn({ model, status: 402 }, "Model not on free tier — skipping");
        continue;
      }

      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        // Timeout — try next model
        logger.warn({ model }, "Model timed out — trying next");
        continue;
      }

      // Any other error — try next model
      logger.warn({ model, status, err: err?.message }, "Model error — trying next");
      continue;
    }

    if (!raw || raw.trim().length < 50) {
      logger.warn({ model }, "Empty/too-short response — trying next");
      continue;
    }

    let jsonStr: string;
    try {
      jsonStr = extractJson(raw);
    } catch {
      logger.warn({ model }, "Could not extract JSON — trying next");
      continue;
    }

    let parsed: GeneratedProject;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(jsonStr));
        logger.info({ model }, "JSON auto-repaired");
      } catch {
        logger.warn({ model }, "JSON parse + repair failed — trying next");
        continue;
      }
    }

    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      logger.warn({ model }, "Invalid project structure — trying next");
      continue;
    }

    const files = sanitiseFiles(parsed.files);
    if (files.length === 0) {
      logger.warn({ model }, "All files invalid after sanitisation — trying next");
      continue;
    }

    parsed.files = files;
    parsed.name = parsed.name || "nova-project";
    parsed.description = parsed.description || `A web project generated by Nova AI`;
    parsed.type = (["static", "react", "nodejs", "fullstack"] as ProjectType[]).includes(parsed.type)
      ? parsed.type : "static";
    parsed.deploymentTip = parsed.deploymentTip || "Deploy on Netlify: app.netlify.com/drop";

    logger.info({ model, name: parsed.name, type: parsed.type, files: files.length }, "Project generation complete");
    return parsed;
  }

  // All models exhausted
  logger.error({ modelsTriedCount: modelQueue.length }, "All models failed for project generation");
  throw new Error(
    "⚠️ All AI models are currently busy or rate-limited. Please wait a minute and try again."
  );
}

// ── Project type label ─────────────────────────────────────────────────────────

export function typeLabel(type: ProjectType): string {
  return {
    static: "Static Website",
    react: "React App",
    nodejs: "Node.js App",
    fullstack: "Full-Stack App",
  }[type];
}
