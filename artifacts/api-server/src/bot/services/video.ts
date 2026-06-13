import axios from "axios";
import http from "http";
import https from "https";
import { logger } from "../../lib/logger.js";

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5 });
const ax = axios.create({ httpAgent, httpsAgent });

// ── Primary: HuggingFace text-to-video (free, no key required) ────────────────
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

// ── Backup: Pollinations.ai video (free, no key) ──────────────────────────────
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
export async function generateVideo(prompt: string): Promise<Buffer | null> {
  // Try HuggingFace first (free models, no key needed for public models)
  const hfResult = await generateVideoHuggingFace(prompt);
  if (hfResult) return hfResult;

  // Fallback: Pollinations video
  logger.warn("HF video failed — trying Pollinations fallback");
  return generateVideoPollinations(prompt);
}
