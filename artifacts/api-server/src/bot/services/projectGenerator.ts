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

// ── Verified working free models on OpenRouter, best for code generation ───────
// Ordered by coding quality. All confirmed working on the free tier.
const FREE_MODEL_QUEUE = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "microsoft/phi-4:free",
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
  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...` : "(not set)";
  logger.info({ userRequest, apiKeyPrefix: maskedKey }, "▶ generateProject start");

  const modelQueue = await buildModelQueue();
  const prompt = buildPrompt(userRequest);

  logger.info({ modelQueue }, "▶ Model queue built");

  const failureLog: string[] = [];

  for (let i = 0; i < modelQueue.length; i++) {
    const model = modelQueue[i];
    let raw = "";

    // ── Stage 1: API request ──────────────────────────────────────────────────
    logger.info({ model, attempt: i + 1, ofTotal: modelQueue.length }, "▶ STAGE 1: sending API request");
    onStatus?.(i === 0 ? "🔨 Building your project..." : `⏳ Trying another model (${i + 1}/${modelQueue.length})...`);

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

      const httpStatus = response.status;
      raw = response.data?.choices?.[0]?.message?.content || "";
      logger.info({ model, httpStatus, rawLength: raw.length, rawPreview: raw.slice(0, 200) }, "▶ STAGE 1 OK: API response received");

    } catch (err: any) {
      const status = err?.response?.status;
      const errMsg = err?.response?.data?.error?.message || err?.message || String(err);

      logger.error({ model, httpStatus: status, errCode: err?.code, errMsg }, "▶ STAGE 1 FAIL: API request error");

      if (status === 401) {
        throw new Error(`❌ OpenRouter API key rejected (401). Check OPENROUTER_API_KEY is valid.\nKey used: ${maskedKey}`);
      }
      if (status === 429) {
        const reason = `[${model}] HTTP 429 rate-limited`;
        failureLog.push(reason);
        logger.warn({ model }, "▶ Rate limited — waiting 1.5s then trying next model");
        onStatus?.(`⏳ Rate limited on model ${i + 1}, trying next...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      if (status === 402) {
        const reason = `[${model}] HTTP 402 payment/quota required`;
        failureLog.push(reason);
        logger.warn({ model }, "▶ Model not on free tier (402) — skipping");
        continue;
      }
      if (status === 503 || status === 502) {
        const reason = `[${model}] HTTP ${status} model offline`;
        failureLog.push(reason);
        logger.warn({ model, status }, "▶ Model offline — skipping");
        continue;
      }
      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        const reason = `[${model}] timed out after 120s`;
        failureLog.push(reason);
        logger.warn({ model }, "▶ Model timed out — trying next");
        onStatus?.(`⏳ Model timed out, trying next...`);
        continue;
      }

      const reason = `[${model}] HTTP ${status ?? "?"} — ${errMsg}`;
      failureLog.push(reason);
      logger.warn({ model, status, errMsg }, "▶ Unknown API error — trying next model");
      continue;
    }

    // ── Stage 2: Validate raw response ───────────────────────────────────────
    logger.info({ model, rawLength: raw.length }, "▶ STAGE 2: validating raw response");

    if (!raw || raw.trim().length < 50) {
      const reason = `[${model}] empty or too-short response (${raw.length} chars)`;
      failureLog.push(reason);
      logger.warn({ model, rawLength: raw.length, raw }, "▶ STAGE 2 FAIL: empty/short response");
      continue;
    }

    // ── Stage 3: JSON extraction ──────────────────────────────────────────────
    logger.info({ model }, "▶ STAGE 3: extracting JSON from response");
    let jsonStr: string;
    try {
      jsonStr = extractJson(raw);
      logger.info({ model, jsonLength: jsonStr.length, jsonPreview: jsonStr.slice(0, 150) }, "▶ STAGE 3 OK: JSON extracted");
    } catch (extractErr: any) {
      const reason = `[${model}] JSON extraction failed — ${extractErr?.message}`;
      failureLog.push(reason);
      logger.warn({ model, extractErr: extractErr?.message, rawPreview: raw.slice(0, 300) }, "▶ STAGE 3 FAIL: could not extract JSON");
      continue;
    }

    // ── Stage 4: JSON parse ───────────────────────────────────────────────────
    logger.info({ model }, "▶ STAGE 4: parsing JSON");
    let parsed: GeneratedProject;
    try {
      parsed = JSON.parse(jsonStr);
      logger.info({ model, projectName: parsed?.name, fileCount: parsed?.files?.length }, "▶ STAGE 4 OK: JSON parsed");
    } catch {
      logger.warn({ model }, "▶ STAGE 4: standard parse failed — attempting jsonrepair");
      try {
        parsed = JSON.parse(jsonrepair(jsonStr));
        logger.info({ model, projectName: parsed?.name, fileCount: parsed?.files?.length }, "▶ STAGE 4 OK: JSON auto-repaired and parsed");
      } catch (repairErr: any) {
        const reason = `[${model}] JSON parse + repair both failed — ${repairErr?.message}`;
        failureLog.push(reason);
        logger.warn({ model, repairErr: repairErr?.message, jsonPreview: jsonStr.slice(0, 300) }, "▶ STAGE 4 FAIL: JSON parse and repair both failed");
        continue;
      }
    }

    // ── Stage 5: Validate project structure ───────────────────────────────────
    logger.info({ model, hasFiles: Array.isArray(parsed?.files), fileCount: parsed?.files?.length }, "▶ STAGE 5: validating project structure");

    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      const reason = `[${model}] invalid project structure — missing or empty files array`;
      failureLog.push(reason);
      logger.warn({ model, parsedKeys: Object.keys(parsed ?? {}) }, "▶ STAGE 5 FAIL: invalid structure");
      continue;
    }

    // ── Stage 6: Sanitise files ───────────────────────────────────────────────
    logger.info({ model, rawFileCount: parsed.files.length }, "▶ STAGE 6: sanitising files");
    const files = sanitiseFiles(parsed.files);
    if (files.length === 0) {
      const reason = `[${model}] all ${parsed.files.length} file(s) failed sanitisation`;
      failureLog.push(reason);
      logger.warn({ model, rawFiles: parsed.files.map((f: any) => f?.path) }, "▶ STAGE 6 FAIL: all files invalid after sanitisation");
      continue;
    }

    // ── Stage 7: Finalise and return ──────────────────────────────────────────
    parsed.files = files;
    parsed.name = parsed.name || "nova-project";
    parsed.description = parsed.description || `A web project generated by Nova AI`;
    parsed.type = (["static", "react", "nodejs", "fullstack"] as ProjectType[]).includes(parsed.type)
      ? parsed.type : "static";
    parsed.deploymentTip = parsed.deploymentTip || "Deploy on Netlify: app.netlify.com/drop";

    logger.info(
      { model, name: parsed.name, type: parsed.type, fileCount: files.length, attempt: i + 1 },
      "▶ STAGE 7 SUCCESS: project generation complete"
    );
    return parsed;
  }

  // ── All models exhausted ──────────────────────────────────────────────────
  logger.error(
    { modelsTriedCount: modelQueue.length, failureLog },
    "▶ ALL MODELS FAILED for project generation"
  );
  const summary = failureLog.length > 0
    ? `\n\nFailure summary:\n${failureLog.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : "";
  throw new Error(
    `⚠️ All ${modelQueue.length} AI models failed. Please wait a minute and try again.${summary}`
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
