import axios from "axios";
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

const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324:free";

async function resolveModel(): Promise<string> {
  const { getOrCreateBotConfig } = await import("../models/BotConfig.js");
  const cfg = await getOrCreateBotConfig();
  const m = cfg.activeCodeModel;
  if (m && typeof m === "string" && m.includes("/") && m.length >= 5) {
    return m;
  }
  return DEFAULT_MODEL;
}

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

RENDER BLUEPRINT RULE:
- For "nodejs" and "fullstack" projects, you MUST include a "vercel.json" file.
- The vercel.json must define the service so Render can deploy it via Blueprint.
- Use the project name (kebab-case) as the service name.
- Always use: type: web, env: node, plan: free, PORT: 10000.
- Example vercel.json:
  services:
    - type: web
      name: my-project-name
      env: node
      plan: free
      buildCommand: npm install
      startCommand: node server.js
      envVars:
        - key: NODE_ENV
          value: production
        - key: PORT
          value: 10000

deploymentTip examples:
- static: "Deploy free on Netlify: drag folder to app.netlify.com/drop"
- react: "Deploy on Vercel: import from GitHub at vercel.com/new"
- nodejs: "Push to GitHub then import the project into Vercel using vercel.json"
- fullstack: "Push to GitHub then import the project into Vercel using vercel.json"`;
}

function extractJson(raw: string): string {
  let text = raw.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error("JSON object not closed — response may be truncated");
  return text.slice(start, end + 1);
}

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

export async function generateProject(
  userRequest: string,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<GeneratedProject> {
  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...` : "(not set)";
  const model = await resolveModel();

  logger.info({ userRequest, apiKeyPrefix: maskedKey, model }, "▶ generateProject start");
  onStatus?.("🔨 Building your project...");

  const prompt = buildPrompt(userRequest);

  let raw: string;
  try {
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
    logger.info({ model, httpStatus: response.status, rawLength: raw.length }, "▶ API response received");
  } catch (err: any) {
    const status = err?.response?.status;
    const errMsg = err?.response?.data?.error?.message || err?.message || String(err);
    logger.error({ model, httpStatus: status, errMsg }, "▶ API request failed");

    if (status === 401) {
      throw new Error(`❌ OpenRouter API key rejected (401). Check OPENROUTER_API_KEY is valid.\nKey used: ${maskedKey}`);
    }
    if (status === 429) {
      throw new Error("❌ Rate limited by OpenRouter. Please wait a moment and try again.");
    }
    if (status === 402) {
      throw new Error("❌ OpenRouter quota exceeded (402). Check your account balance.");
    }
    throw new Error(`❌ AI request failed (HTTP ${status ?? "?"}): ${errMsg}`);
  }

  if (!raw || raw.trim().length < 50) {
    throw new Error(`❌ AI returned an empty response. Please try again.`);
  }

  let jsonStr: string;
  try {
    jsonStr = extractJson(raw);
  } catch (err: any) {
    logger.error({ model, errMsg: err?.message, rawPreview: raw.slice(0, 300) }, "▶ JSON extraction failed");
    throw new Error(`❌ AI response could not be parsed. Please try again.`);
  }

  let parsed: GeneratedProject;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err: any) {
    logger.error({ model, errMsg: err?.message, jsonPreview: jsonStr.slice(0, 300) }, "▶ JSON parse failed");
    throw new Error(`❌ AI returned malformed JSON. Please try again.`);
  }

  if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error(`❌ AI returned an invalid project structure. Please try again.`);
  }

  const files = sanitiseFiles(parsed.files);
  if (files.length === 0) {
    throw new Error(`❌ Generated files failed validation. Please try again.`);
  }

  parsed.files = files;
  parsed.name = parsed.name || "nova-project";
  parsed.description = parsed.description || "A web project generated by Nova AI";
  parsed.type = (["static", "react", "nodejs", "fullstack"] as ProjectType[]).includes(parsed.type)
    ? parsed.type : "static";
  parsed.deploymentTip = parsed.deploymentTip || "Deploy on Netlify: app.netlify.com/drop";

  logger.info({ model, name: parsed.name, type: parsed.type, fileCount: files.length }, "▶ Project generation complete");
  return parsed;
}

export function typeLabel(type: ProjectType): string {
  return {
    static: "Static Website",
    react: "React App",
    nodejs: "Node.js App",
    fullstack: "Full-Stack App",
  }[type];
}
