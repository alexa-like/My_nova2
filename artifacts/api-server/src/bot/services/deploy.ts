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

  // Poll up to 5 minutes checking actual deploy status (not just URL existence)
  const MAX_POLLS = 60;
  const POLL_MS = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    try {
      const resp = await axios.get(`${RENDER_API}/services/${serviceId}/deploys?limit=1`, {
        headers: renderHeaders(token),
        timeout: 15000,
      });
      const deploys: any[] = resp.data;
      const latest = deploys?.[0]?.deploy;
      const deployStatus: string = latest?.status ?? "";

      if (deployStatus === "live") {
        // Fetch the live URL from the service
        const svcResp = await axios.get(`${RENDER_API}/services/${serviceId}`, {
          headers: renderHeaders(token),
          timeout: 15000,
        }).catch(() => null);
        const liveUrl: string =
          svcResp?.data?.service?.serviceDetails?.url ||
          svcResp?.data?.serviceDetails?.url ||
          serviceUrl ||
          `https://${serviceId}.onrender.com`;
        const fullUrl = liveUrl.startsWith("http") ? liveUrl : `https://${liveUrl}`;
        logger.info({ serviceId, url: fullUrl }, "Render deployment live");
        return {
          id: serviceId,
          url: fullUrl,
          inspectorUrl: `https://dashboard.render.com/static/${serviceId}`,
          provider: "render",
        };
      }

      if (deployStatus === "build_failed" || deployStatus === "canceled") {
        throw new Error(`Render build ${deployStatus}. Check your Render dashboard for details.`);
      }
    } catch (pollErr: any) {
      if (pollErr?.message?.includes("build_failed") || pollErr?.message?.includes("canceled")) {
        throw pollErr;
      }
      continue;
    }

    if (onStatus && i > 0 && i % 4 === 0) {
      const elapsed = Math.round((i * POLL_MS) / 1000);
      await onStatus(`🟣 Render building... ${elapsed}s`);
    }
  }

  // Timed out — return dashboard link so user can check manually
  const dashUrl = `https://dashboard.render.com/static/${serviceId}`;
  logger.warn({ serviceId }, "Render polling timed out — returning dashboard URL");
  return { id: serviceId, url: dashUrl, inspectorUrl: dashUrl, provider: "render" };
}

