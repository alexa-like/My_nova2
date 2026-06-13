import axios from "axios";
import http from "http";
import https from "https";
import { logger } from "../../lib/logger.js";

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5 });
const ax = axios.create({ httpAgent, httpsAgent });

// ── Optional: fal.ai text-to-video (uses FAL_KEY if set) ─────────────────────
async function generateVideoFal(prompt: string): Promise<Buffer | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return null;

  const models = [
    "fal-ai/minimax-video",
    "fal-ai/fast-animatediff/text-to-video",
    "fal-ai/kling-video/v1/standard/text-to-video",
  ];

  for (const model of models) {
    try {
      logger.info({ model }, "Attempting fal.ai text-to-video");

      // Submit to fal.ai queue
      const submitResp = await ax.post(
        `https://queue.fal.run/${model}`,
        { prompt },
        {
          headers: {
            "Authorization": `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const { request_id, status_url, response_url } = submitResp.data as {
        request_id: string;
        status_url: string;
        response_url: string;
      };

      if (!status_url || !request_id) {
        logger.warn({ model }, "fal.ai submit gave no status_url");
        continue;
      }

      // Poll until complete (max 2 minutes)
      const deadline = Date.now() + 120_000;
      let resultUrl = response_url;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusResp = await ax.get(status_url, {
          headers: { "Authorization": `Key ${falKey}` },
          timeout: 15000,
        });
        const { status, logs } = statusResp.data as { status: string; logs?: unknown[] };
        if (status === "COMPLETED") {
          resultUrl = response_url || statusResp.data.response_url;
          break;
        }
        if (status === "FAILED" || status === "CANCELLED") {
          logger.warn({ model, status, logs }, "fal.ai job failed/cancelled");
          break;
        }
      }

      if (!resultUrl) continue;

      // Fetch result metadata
      const resultResp = await ax.get(resultUrl, {
        headers: { "Authorization": `Key ${falKey}` },
        timeout: 15000,
      });
      const videoUrl: string | undefined =
        resultResp.data?.video?.url ||
        resultResp.data?.video_url ||
        resultResp.data?.output?.video_url;

      if (!videoUrl) {
        logger.warn({ model, data: JSON.stringify(resultResp.data).slice(0, 200) }, "fal.ai no video URL in result");
        continue;
      }

      // Download the video bytes
      const dlResp = await ax.get(videoUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
      });
      const buf = Buffer.from(dlResp.data);
      if (buf.byteLength > 5000) {
        logger.info({ bytes: buf.byteLength, model }, "fal.ai video generated");
        return buf;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 402 || status === 403) {
        logger.warn({ model, status }, "fal.ai insufficient balance — skipping all fal models");
        return null;
      }
      logger.warn({ model, status, err: err?.message }, "fal.ai video model failed");
    }
  }
  return null;
}

// ── Primary (free): HuggingFace text-to-video ─────────────────────────────────
async function generateVideoHuggingFace(prompt: string): Promise<Buffer | null> {
  const models = [
    "Wan-AI/Wan2.1-T2V-1.3B",
    "damo-vilab/text-to-video-ms-1.7b",
    "ali-vilab/text-to-video-ms-1.7b",
    "cerspense/zeroscope_v2_576w",
  ];
  const token = process.env.HUGGINGFACE_API_TOKEN;
  for (const model of models) {
    try {
      logger.info({ model }, "Attempting HF text-to-video");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Wait-For-Model": "true",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const resp = await ax.post(
        `https://api-inference.huggingface.co/models/${model}`,
        { inputs: prompt },
        { headers, responseType: "arraybuffer", timeout: 150000 }
      );
      const buf = Buffer.from(resp.data);
      const ct = (resp.headers["content-type"] as string) || "";
      if ((ct.includes("video") || ct.includes("mp4") || ct.includes("octet-stream")) && buf.byteLength > 5000) {
        logger.info({ bytes: buf.byteLength, model }, "HF video generated");
        return buf;
      }
      logger.warn({ model, ct, bytes: buf.byteLength }, "HF video unexpected response");
    } catch (err: any) {
      logger.warn({ model, status: err?.response?.status, err: err?.message }, "HF video model failed");
    }
  }
  return null;
}

// ── Last resort: Pollinations.ai video (free, no key) ─────────────────────────
async function generateVideoPollinations(prompt: string): Promise<Buffer | null> {
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://video.pollinations.ai/prompt/${encoded}`;
    logger.info({ prompt: prompt.slice(0, 60) }, "Attempting Pollinations video");
    const resp = await ax.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers: { "User-Agent": "Nova-Bot/1.0" },
    });
    const buf = Buffer.from(resp.data);
    const ct = (resp.headers["content-type"] as string) || "";
    if ((ct.includes("video") || ct.includes("mp4") || ct.includes("octet-stream")) && buf.byteLength > 5000) {
      logger.info({ bytes: buf.byteLength }, "Pollinations video generated");
      return buf;
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Pollinations video failed");
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
// Priority: fal.ai (if FAL_KEY set) → HuggingFace (free) → Pollinations (free)
export async function generateVideo(prompt: string): Promise<Buffer | null> {
  const falResult = await generateVideoFal(prompt);
  if (falResult) return falResult;

  if (process.env.FAL_KEY) {
    logger.warn("fal.ai video failed — falling back to HuggingFace");
  }

  const hfResult = await generateVideoHuggingFace(prompt);
  if (hfResult) return hfResult;

  logger.warn("HF video failed — trying Pollinations fallback");
  return generateVideoPollinations(prompt);
}
