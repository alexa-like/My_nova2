import axios from "axios";
import { jsonrepair } from "jsonrepair";
import { logger } from "../../lib/logger.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";

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
- "static": pure HTML + CSS + vanilla JS. For: portfolios, landing pages, calculators, clocks, games, simple tools. No build step — runs directly in browser.
- "react": React 18 + Babel via CDN (NO npm). For: dashboards, SPAs, interactive apps. All in one index.html using CDN React + script type="text/babel".
- "nodejs": Express + plain HTML frontend. For: chat apps, REST APIs, real-time features. Include server.js + package.json + public/index.html.
- "fullstack": Express + MongoDB/sqlite concept + frontend. For: complex apps needing persistence.

QUALITY RULES (non-negotiable):
1. Generate COMPLETE, WORKING code — no TODOs, no "// your code here", no placeholders
2. Modern design: CSS custom properties (variables), flexbox/grid, smooth transitions, proper typography
3. Mobile-responsive: works on phones and desktops
4. For static/react: add realistic sample content (not Lorem Ipsum)
5. Color scheme: professional and consistent (dark mode preferred for dashboards)
6. Proper error states, loading states where applicable
7. README.md must include: title, description, tech stack, how to run, features list
8. Maximum 8 files total

TECH STACK BY TYPE:
- static: HTML5, CSS3 (variables + flexbox/grid), vanilla ES6+ JS
- react: React 18 CDN + Babel Standalone + modern CSS
- nodejs: Express 4, vanilla JS frontend, package.json with scripts
- fullstack: Express 4, lowdb or in-memory store, vanilla JS

deploymentTip examples:
- static: "Deploy free on Netlify: drag the folder to app.netlify.com/drop"
- react: "Deploy on Vercel: import from GitHub at vercel.com/new"  
- nodejs: "Deploy on Render: push to GitHub then connect at render.com"
- fullstack: "Deploy backend on Railway, frontend separately on Vercel"`;
}

// ── JSON extraction (robust) ───────────────────────────────────────────────────

function extractJson(raw: string): string {
  let text = raw.trim();

  // Strip DeepSeek R1 / reasoning model <think>...</think> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip markdown fences (```json ... ``` or ``` ... ```)
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Find the outermost JSON object by scanning for balanced braces
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No valid JSON object found in model response.");

  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) throw new Error("JSON object is not properly closed in model response.");

  return text.slice(start, end + 1);
}

// ── Main generator ─────────────────────────────────────────────────────────────

const FALLBACK_CODE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
  "microsoft/phi-4:free",
  "meta-llama/llama-3.1-8b-instruct:free",
];

export async function generateProject(
  userRequest: string,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<GeneratedProject> {
  logger.info({ userRequest }, "Generating project — trying code models in order");

  // Build model chain from BotConfig (active first, then others, then hardcoded fallbacks)
  let codeModels: string[] = FALLBACK_CODE_MODELS;
  try {
    const cfg = await getOrCreateBotConfig();
    if (cfg.codeModels && cfg.codeModels.length > 0) {
      const active = cfg.activeCodeModel || cfg.codeModels[0].id;
      const rest = cfg.codeModels.map(m => m.id).filter(id => id !== active);
      const fallback = FALLBACK_CODE_MODELS.filter(id => id !== active && !rest.includes(id));
      codeModels = [active, ...rest, ...fallback];
    }
  } catch {}

  const failures: string[] = [];
  const prompt = buildPrompt(userRequest);

  for (let modelIdx = 0; modelIdx < codeModels.length; modelIdx++) {
    const model = codeModels[modelIdx];
    const shortName = model.split("/").pop() ?? model;
    let raw = "";
    try {
      if (modelIdx === 0) {
        onStatus?.("🔨 Building your project");
      } else {
        onStatus?.(`🔄 Trying model ${modelIdx + 1}/${codeModels.length}`);
      }
      logger.info({ model }, "Attempting project generation");
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are an expert full-stack web developer. You ONLY output raw JSON — never any markdown, never any explanation text. Just the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 8192,
          temperature: 0.2,
          top_p: 0.9,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL || "https://nova-bot.replit.app",
            "X-Title": "Nova AI Bot — Project Builder",
          },
          timeout: 90000,
        }
      );
      raw = response.data?.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      const status = err?.response?.status;
      const errMsg = err?.response?.data?.error?.message || err?.message || "unknown error";
      if (status === 401) {
        throw new Error(`API key rejected (401). Check your OPENROUTER_API_KEY.`);
      }
      const reason = status ? `HTTP ${status}` : (err.code === "ECONNABORTED" ? "timeout" : errMsg.slice(0, 60));
      failures.push(`${shortName}: ${reason}`);
      logger.warn({ model, status, errMsg }, "Model failed — trying next");
      continue;
    }

    if (!raw || raw.trim().length < 10) {
      failures.push(`${shortName}: empty response`);
      logger.warn({ model }, "Model returned empty response — trying next");
      continue;
    }

    let jsonStr: string;
    try {
      jsonStr = extractJson(raw);
    } catch {
      failures.push(`${shortName}: bad format`);
      logger.warn({ model, rawPreview: raw.substring(0, 200) }, "Could not extract JSON — trying next model");
      continue;
    }

    let parsed: GeneratedProject;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // JSON.parse failed — attempt auto-repair (handles unescaped quotes in code strings)
      try {
        const repaired = jsonrepair(jsonStr);
        parsed = JSON.parse(repaired);
        logger.info({ model }, "JSON auto-repaired successfully");
      } catch {
        failures.push(`${shortName}: JSON parse failed`);
        logger.warn({ model, jsonPreview: jsonStr.substring(0, 200) }, "JSON parse + repair both failed — trying next model");
        continue;
      }
    }

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      failures.push(`${shortName}: invalid structure`);
      logger.warn({ model }, "Project has invalid structure — trying next model");
      continue;
    }

    // Sanitize and validate files — prevent path traversal and unsafe filenames
    parsed.files = parsed.files
      .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
      .map((f) => {
        let safePath = f.path
          .replace(/\\/g, "/")
          .replace(/^\/+/, "")
          .replace(/[<>:"|?*\x00-\x1f]/g, "")
          .replace(/\.{2,}/g, ".")
          .replace(/\/\.+\//g, "/")
          .replace(/\/+/g, "/")
          .replace(/^\.+\//, "")
          .slice(0, 255);
        return {
          path: safePath,
          content: typeof f.content === "string" ? f.content : JSON.stringify(f.content, null, 2),
        };
      })
      .filter((f) => f.path.length > 0 && f.content.length > 0 && !f.path.startsWith("."));

    if (parsed.files.length === 0) {
      failures.push(`${shortName}: all files invalid`);
      logger.warn({ model }, "All generated files were invalid — trying next model");
      continue;
    }

    parsed.name = parsed.name || "nova-project";
    parsed.description = parsed.description || `A ${parsed.type || "web"} project generated by Nova AI`;
    parsed.type = (["static", "react", "nodejs", "fullstack"] as ProjectType[]).includes(parsed.type)
      ? parsed.type
      : "static";
    parsed.deploymentTip = parsed.deploymentTip || "Deploy on Netlify for free: app.netlify.com/drop";

    logger.info({ model, name: parsed.name, type: parsed.type, files: parsed.files.length }, "Project generation complete");
    return parsed;
  }

  logger.warn({ failures }, "All OpenRouter models failed for project generation");
  const summary = failures.length > 0 ? `\n\nDetails: ${failures.join(" | ")}` : "";
  throw new Error(`⚠️ All AI models failed to generate your project. Please try again in a moment.${summary}`);
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
