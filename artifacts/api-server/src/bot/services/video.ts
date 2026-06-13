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
    "damo-vilab/text-to-video-ms-1.7b",
    "ali-vilab/text-to-video-ms-1.7b",
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
    } catch (err: any) {
      logger.warn({ model, status: err?.response?.status, err: err?.message }, "HF video model failed");
    }
  }
  return null;
}

// ── Backup: fal.ai queue API (requires FAL_KEY) ───────────────────────────────
async function generateVideoFal(prompt: string): Promise<Buffer | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;

  const models = [
    "fal-ai/fast-animatediff/text-to-video",
    "fal-ai/minimax-video/text-to-video",
  ];

  for (const model of models) {
    try {
      logger.info({ model }, "Attempting fal.ai video generation");
      const submitResp = await ax.post(
        `https://queue.fal.run/${model}`,
        { prompt, num_frames: 16, fps: 8 },
        {
          headers: {
            Authorization: `Key ${key}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      const requestId: string | undefined = submitResp.data?.request_id;
      if (!requestId) continue;

      // Poll for completion (max ~90s)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const statusResp = await ax.get(
            `https://queue.fal.run/${model}/requests/${requestId}`,
            { headers: { Authorization: `Key ${key}` }, timeout: 10000 }
          );
          const status: string = statusResp.data?.status;
          if (status === "COMPLETED") {
            const videoUrl: string | undefined =
              statusResp.data?.result?.video?.url ||
              statusResp.data?.output?.video?.url ||
              statusResp.data?.result?.video_url;
            if (videoUrl) {
              const vidResp = await ax.get(videoUrl, {
                responseType: "arraybuffer",
                timeout: 60000,
              });
              const buf = Buffer.from(vidResp.data);
              if (buf.byteLength > 5000) {
                logger.info({ bytes: buf.byteLength, model }, "fal.ai video generated");
                return buf;
              }
            }
            break;
          }
          if (status === "FAILED") {
            logger.warn({ model, requestId }, "fal.ai job failed");
            break;
          }
        } catch (pollErr: any) {
          logger.warn({ model, err: pollErr?.message }, "fal.ai poll error");
        }
      }
    } catch (err: any) {
      logger.warn({ model, err: err?.message }, "fal.ai video submission failed");
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateVideo(prompt: string): Promise<Buffer | null> {
  const hfResult = await generateVideoHuggingFace(prompt);
  if (hfResult) return hfResult;

  logger.warn("HF video failed — trying fal.ai backup");
  return generateVideoFal(prompt);
}
