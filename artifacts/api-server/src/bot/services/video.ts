import axios from "axios";
import { logger } from "../../lib/logger.js";

// ── Only models confirmed to work on the standard HF Inference API ────────────
// AnimateDiff-Lightning and Wan2.1 require private inference endpoints, NOT the
// standard api-inference.huggingface.co endpoint — they always 404/503 there.
const VIDEO_MODELS = [
  "damo-vilab/text-to-video-ms-1.7b",   // ModelScope T2V — standard HF Inference API ✓
  "cerspense/zeroscope_v2_576w",          // ZeroScope v2 — reliable fallback ✓
  "ali-vilab/text-to-video-ms-1.7b",     // alias for damo-vilab ✓
];

const COLD_START_DELAY_MS = 20000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVideo(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  // Trim prompt — video models work best under 200 chars
  const trimmedPrompt = prompt.slice(0, 200).trim();

  for (const modelId of VIDEO_MODELS) {
    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info({ model: modelId, attempt }, "Generating video");
        if (onStatus && attempt > 1) {
          await onStatus(`⏳ Generating video (attempt ${attempt}/3)...`);
        }

        const response = await axios.post(
          endpoint,
          { inputs: trimmedPrompt },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Wait-For-Model": "true",
            },
            responseType: "arraybuffer",
            timeout: 300000, // 5 min — video models are slow
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (
          contentType.includes("video") ||
          contentType.includes("gif") ||
          contentType.includes("octet-stream") ||
          byteLength > 20000
        ) {
          logger.info({ model: modelId, byteLength, contentType }, "Video generated successfully");
          return Buffer.from(response.data);
        }

        // Try to decode an error message from the response
        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          const errMsg: string = json?.error || "";
          logger.warn({ model: modelId, error: errMsg }, "Video API returned non-video response");

          if (errMsg.toLowerCase().includes("loading") && attempt < 3) {
            const waitMs = COLD_START_DELAY_MS * attempt;
            if (onStatus) await onStatus(`⏳ Video model warming up... waiting ${Math.round(waitMs / 1000)}s`);
            await sleep(waitMs);
            continue;
          }
        } catch {}

        break;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt < 3) {
          const waitMs = COLD_START_DELAY_MS * attempt;
          if (onStatus) await onStatus(`⏳ Video model loading... ${Math.round(waitMs / 1000)}s wait`);
          logger.warn({ model: modelId, attempt }, "Video model cold start (503) — waiting");
          await sleep(waitMs);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId }, "Video generation failed for model");
        break;
      }
    }

    const isLast = modelId === VIDEO_MODELS[VIDEO_MODELS.length - 1];
    if (!isLast && onStatus) await onStatus(`🔄 Trying next video model...`);
  }

  return null;
}
