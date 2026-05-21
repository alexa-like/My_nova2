import axios from "axios";
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

  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Find the outermost JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No valid JSON object found in model response.");
  }

  return text.slice(start, end + 1);
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateProject(
  userRequest: string,
  apiKey: string
): Promise<GeneratedProject> {
  const config = await getOrCreateBotConfig();
  const model = config.activeChatModel || "meta-llama/llama-3.3-70b-instruct";

  logger.info({ userRequest, model }, "Generating project");

  let raw: string;
  try {
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
            content: buildPrompt(userRequest),
          },
        ],
        max_tokens: 8000,
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
        timeout: 120000,
      }
    );
    raw = response.data?.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    logger.error({ err: err?.message }, "OpenRouter request failed for project generation");
    throw new Error(
      err?.response?.status === 401
        ? "AI service authentication failed. Check your OPENROUTER_API_KEY."
        : "AI service timed out. Please try again."
    );
  }

  if (!raw || raw.trim().length < 10) {
    throw new Error("AI returned an empty response. Please try again.");
  }

  let jsonStr: string;
  try {
    jsonStr = extractJson(raw);
  } catch {
    logger.error({ rawPreview: raw.substring(0, 300) }, "Could not extract JSON from model output");
    throw new Error("The AI returned an unexpected format. Please try again.");
  }

  let parsed: GeneratedProject;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ err, jsonPreview: jsonStr.substring(0, 300) }, "JSON parse failed");
    throw new Error("Failed to parse the generated project. Please try again.");
  }

  // Validate structure
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Generated project has invalid structure.");
  }
  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error("AI generated an empty project. Try a more specific description.");
  }

  // Sanitize and validate files
  parsed.files = parsed.files
    .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
    .map((f) => ({
      path: f.path
        .replace(/^\/+/, "")        // no leading slash
        .replace(/\.\.\//g, "")     // no directory traversal
        .replace(/[<>:"|?*]/g, ""), // no invalid chars
      content:
        typeof f.content === "string" ? f.content : JSON.stringify(f.content, null, 2),
    }))
    .filter((f) => f.path.length > 0 && f.content.length > 0);

  if (parsed.files.length === 0) {
    throw new Error("All generated files were invalid. Please try again.");
  }

  parsed.name = parsed.name || "nova-project";
  parsed.description = parsed.description || `A ${parsed.type || "web"} project generated by Nova AI`;
  parsed.type = (["static", "react", "nodejs", "fullstack"] as ProjectType[]).includes(parsed.type)
    ? parsed.type
    : "static";
  parsed.deploymentTip = parsed.deploymentTip || "Deploy on Netlify for free: app.netlify.com/drop";

  logger.info(
    { name: parsed.name, type: parsed.type, files: parsed.files.length },
    "Project generation complete"
  );

  return parsed;
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
