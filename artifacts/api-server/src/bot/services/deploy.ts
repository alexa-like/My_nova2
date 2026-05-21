import axios from "axios";
import { logger } from "../../lib/logger.js";

const VERCEL_API = "https://api.vercel.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface VercelDeployResult {
  id: string;
  url: string;
  inspectorUrl: string;
}

// ── Vercel file-upload deployment ─────────────────────────────────────────────

export async function deployToVercel(
  token: string,
  projectName: string,
  files: Array<{ path: string; content: string }>,
  onStatus?: (msg: string) => Promise<void>
): Promise<VercelDeployResult> {
  const filePayload = files.map((f) => ({
    file: f.path,
    data: f.content,
    encoding: "utf-8",
  }));

  logger.info({ projectName, fileCount: files.length }, "Deploying to Vercel");

  // Initiate deployment
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
      { headers: headers(token), timeout: 60000 }
    );
    deployId = resp.data.id;
    previewUrl = resp.data.url || "";
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message || err.message;
    if (status === 401 || status === 403) {
      throw new Error("Vercel authentication failed. Check your VERCEL_TOKEN.");
    }
    throw new Error(`Vercel API error: ${msg}`);
  }

  if (onStatus) await onStatus("⚙️ Building deployment...");

  // Poll until ready (max 5 minutes)
  const MAX_POLLS = 60;
  const POLL_MS = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    let stateData: any;
    try {
      const resp = await axios.get(`${VERCEL_API}/v13/deployments/${deployId}`, {
        headers: headers(token),
        timeout: 15000,
      });
      stateData = resp.data;
    } catch {
      continue; // transient network error — keep polling
    }

    const state: string = stateData.readyState;

    if (state === "READY") {
      const liveUrl = stateData.url || previewUrl;
      logger.info({ deployId, url: liveUrl }, "Vercel deployment ready");
      return {
        id: deployId,
        url: liveUrl.startsWith("http") ? liveUrl : `https://${liveUrl}`,
        inspectorUrl: `https://vercel.com/deployments/${deployId}`,
      };
    }

    if (state === "ERROR" || state === "CANCELED") {
      const errMsg = stateData.errorMessage || `Deployment ${state.toLowerCase()}`;
      throw new Error(errMsg);
    }

    // Status update every 20 seconds
    if (onStatus && i > 0 && i % 4 === 0) {
      const elapsed = Math.round((i * POLL_MS) / 1000);
      await onStatus(`⚙️ Building... ${elapsed}s`);
    }
  }

  throw new Error("Deployment timed out after 5 minutes. Check Vercel dashboard.");
}
