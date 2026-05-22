import axios from "axios";
import { logger } from "../../lib/logger.js";

const VERCEL_API = "https://api.vercel.com";
const RENDER_API = "https://api.render.com/v1";

function vercelHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function renderHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface DeployResult {
  id: string;
  url: string;
  inspectorUrl: string;
  provider: "vercel" | "render";
}

// ── Vercel file-upload deployment ─────────────────────────────────────────────

export async function deployToVercel(
  token: string,
  projectName: string,
  files: Array<{ path: string; content: string }>,
  onStatus?: (msg: string) => Promise<void>
): Promise<DeployResult> {
  const filePayload = files.map((f) => ({
    file: f.path,
    data: f.content,
    encoding: "utf-8",
  }));

  logger.info({ projectName, fileCount: files.length }, "Deploying to Vercel");

  let deployId: string;
  let previewUrl: string;
  try {
    const resp = await axios.post(
      `${VERCEL_API}/v13/deployments`,
      {
        name: projectName,
        files: filePayload,
        projectSettings: { framework: null },
        target: "production",
      },
      { headers: vercelHeaders(token), timeout: 60000 }
    );
    deployId = resp.data.id;
    previewUrl = resp.data.url || "";
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message || err.message;
    if (status === 401 || status === 403) {
      throw new Error("Vercel authentication failed. Check your Vercel token in ⚙️ Settings → 🚀 Deployments.");
    }
    throw new Error(`Vercel API error: ${msg}`);
  }

  if (onStatus) await onStatus("📦 Building project...");

  const MAX_POLLS = 60;
  const POLL_MS = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    let stateData: any;
    try {
      const resp = await axios.get(`${VERCEL_API}/v13/deployments/${deployId}`, {
        headers: vercelHeaders(token),
        timeout: 15000,
      });
      stateData = resp.data;
    } catch {
      continue;
    }

    const state: string = stateData.readyState;

    if (state === "READY") {
      const liveUrl = stateData.url || previewUrl;
      logger.info({ deployId, url: liveUrl }, "Vercel deployment ready");
      return {
        id: deployId,
        url: liveUrl.startsWith("http") ? liveUrl : `https://${liveUrl}`,
        inspectorUrl: `https://vercel.com/deployments/${deployId}`,
        provider: "vercel",
      };
    }

    if (state === "ERROR" || state === "CANCELED") {
      const errMsg = stateData.errorMessage || `Deployment ${state.toLowerCase()}`;
      throw new Error(errMsg);
    }

    if (onStatus && i > 0 && i % 4 === 0) {
      const elapsed = Math.round((i * POLL_MS) / 1000);
      await onStatus(`🚀 Deploying... ${elapsed}s`);
    }
  }

  throw new Error("Deployment timed out after 5 minutes. Check your Vercel dashboard.");
}

// ── Render static site deployment (requires GitHub repo) ─────────────────────

export async function deployToRender(
  token: string,
  projectName: string,
  repoUrl: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<DeployResult> {
  if (!repoUrl) {
    throw new Error("Render deployment requires a GitHub repository. Connect GitHub in ⚙️ Settings → 🔑 GitHub first.");
  }

  logger.info({ projectName, repoUrl }, "Deploying to Render");

  let ownerId: string;
  try {
    const resp = await axios.get(`${RENDER_API}/owners?limit=1`, {
      headers: renderHeaders(token),
      timeout: 15000,
    });
    ownerId = resp.data[0]?.owner?.id;
    if (!ownerId) throw new Error("Could not get Render owner ID.");
  } catch (err: any) {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      throw new Error("Render authentication failed. Check your Render token in ⚙️ Settings → 🚀 Deployments.");
    }
    throw new Error(`Render API error: ${err.message}`);
  }

  if (onStatus) await onStatus("🔗 Creating Render service...");

  let serviceId: string;
  let serviceUrl = "";
  try {
    const resp = await axios.post(
      `${RENDER_API}/services`,
      {
        type: "static_site",
        name: projectName.substring(0, 50).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        ownerId,
        repo: repoUrl,
        branch: "main",
        serviceDetails: { buildCommand: "", publishPath: "." },
        autoDeploy: "yes",
      },
      { headers: renderHeaders(token), timeout: 30000 }
    );
    serviceId = resp.data.service?.id;
    serviceUrl = resp.data.service?.serviceDetails?.url || "";
    if (!serviceId) throw new Error("No service ID returned from Render.");
  } catch (err: any) {
    const msg = err?.response?.data?.message || err.message;
    throw new Error(`Render service creation failed: ${msg}`);
  }

  if (onStatus) await onStatus("🟣 Deploying on Render... (2–5 min)");

  // Trigger a deploy
  try {
    await axios.post(
      `${RENDER_API}/services/${serviceId}/deploys`,
      { clearCache: "do_not_clear" },
      { headers: renderHeaders(token), timeout: 15000 }
    );
  } catch (err: any) {
    logger.warn({ err }, "Render deploy trigger failed (service may auto-deploy from GitHub)");
  }

  // Poll up to 4 minutes for the service to go live
  const MAX_POLLS = 48;
  const POLL_MS = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    try {
      const resp = await axios.get(`${RENDER_API}/services/${serviceId}`, {
        headers: renderHeaders(token),
        timeout: 15000,
      });
      const svc = resp.data.service || resp.data;
      const suspended = svc?.suspended;
      const liveUrl: string = svc?.serviceDetails?.url || serviceUrl || "";

      if (liveUrl && suspended !== "suspended") {
        logger.info({ serviceId, url: liveUrl }, "Render deployment live");
        const fullUrl = liveUrl.startsWith("http") ? liveUrl : `https://${liveUrl}`;
        return {
          id: serviceId,
          url: fullUrl,
          inspectorUrl: `https://dashboard.render.com/static/${serviceId}`,
          provider: "render",
        };
      }
    } catch {
      continue;
    }

    if (onStatus && i > 0 && i % 4 === 0) {
      const elapsed = Math.round((i * POLL_MS) / 1000);
      await onStatus(`🟣 Render building... ${elapsed}s`);
    }
  }

  // Return dashboard even if not confirmed live yet
  const dashUrl = `https://dashboard.render.com/static/${serviceId}`;
  return { id: serviceId, url: dashUrl, inspectorUrl: dashUrl, provider: "render" };
}

// ── AI-powered auto-fix for failed deployments ────────────────────────────────

export async function autoFixProjectFiles(
  files: Array<{ path: string; content: string }>,
  errorMessage: string,
  projectDescription: string,
  apiKey: string
): Promise<Array<{ path: string; content: string }> | null> {
  try {
    const fileList = files
      .map((f) => `=== ${f.path} ===\n${f.content}`)
      .join("\n\n");

    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You are a senior web developer fixing deployment errors. Return ONLY a raw JSON object. No markdown fences, no explanation.",
          },
          {
            role: "user",
            content:
              `Project: ${projectDescription}\n\n` +
              `Deployment error: ${errorMessage}\n\n` +
              `Current files:\n${fileList}\n\n` +
              `Fix ALL issues that would cause this error. Return:\n` +
              `{"files": [{"path": "filename", "content": "full fixed content"}, ...]}\n\n` +
              `Include ALL files, not just the changed ones.`,
          },
        ],
        max_tokens: 8000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      }
    );

    const raw: string = resp.data.choices?.[0]?.message?.content || "";
    const cleaned = raw
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed.files) && parsed.files.length > 0) {
      logger.info({ fixedFiles: parsed.files.length }, "Auto-fix files generated");
      return parsed.files as Array<{ path: string; content: string }>;
    }
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Auto-fix generation failed");
    return null;
  }
}
