import axios from "axios";
import { logger } from "../../lib/logger.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Fal.ai video generation ───────────────────────────────────────────────────
// Free tier available at fal.ai — set FAL_KEY env var to enable.
// Models: fast-animatediff-t2v (fast), wan/v2.1/1.3b/text-to-video (quality)
const FAL_MODELS = [
  "fal-ai/fast-animatediff-t2v",
  "fal-ai/wan/v2.1/1.3b/text-to-video",
];

async function generateFalVideo(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return null;

  for (const model of FAL_MODELS) {
    try {
      if (onStatus) await onStatus(`🎬 Submitting to fal.ai...`);
      logger.info({ model }, "Submitting video to fal.ai queue");

      const submitRes = await axios.post(
        `https://queue.fal.run/${model}`,
        { prompt, num_frames: 16, fps: 8 },
        {
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const requestId: string = submitRes.data?.request_id;
      if (!requestId) {
        logger.warn({ model, data: submitRes.data }, "Fal.ai: no request_id in response");
        continue;
      }

      // Poll for completion — fal.ai typically completes in 20-60s on free tier
      for (let i = 0; i < 40; i++) {
        await sleep(3000);

        if (onStatus && i > 0 && i % 4 === 0) {
          await onStatus(`⏳ Generating video... (~${i * 3}s)`);
        }

        const statusRes = await axios.get(
          `https://queue.fal.run/${model}/requests/${requestId}/status`,
          {
            headers: { Authorization: `Key ${falKey}` },
            timeout: 15000,
          }
        );

        const status: string = statusRes.data?.status;

        if (status === "COMPLETED") {
          const resultRes = await axios.get(
            `https://queue.fal.run/${model}/requests/${requestId}`,
            {
              headers: { Authorization: `Key ${falKey}` },
              timeout: 15000,
            }
          );

          const videoUrl: string | undefined =
            resultRes.data?.video?.url ?? resultRes.data?.videos?.[0]?.url;

          if (!videoUrl) {
            logger.warn({ model, result: resultRes.data }, "Fal.ai: completed but no video URL");
            break;
          }

          if (onStatus) await onStatus("⬇️ Downloading video...");
          const videoRes = await axios.get(videoUrl, {
            responseType: "arraybuffer",
            timeout: 120000,
          });

          const buf = Buffer.from(videoRes.data);
          logger.info({ model, bytes: buf.byteLength }, "Fal.ai video generated successfully");
          return buf;
        }

        if (status === "FAILED") {
          logger.warn({ model, requestId, detail: statusRes.data }, "Fal.ai video generation failed");
          break;
        }

        // IN_QUEUE or IN_PROGRESS — keep polling
      }
    } catch (err: any) {
      const status = err?.response?.status;
      logger.warn({ err: err?.message, status, model }, "Fal.ai video error — trying next model");
    }
  }

  return null;
}

// ── HuggingFace video generation (last-resort fallback) ──────────────────────
// These models have cold-start issues on the free tier but are still tried
// if FAL_KEY is not set.
const HF_VIDEO_MODELS = [
  "damo-vilab/text-to-video-ms-1.7b",
  "ali-vilab/text-to-video-ms-1.7b",
  "cerspense/zeroscope_v2_576w",
];

const COLD_START_DELAY_MS = 20000;

async function generateHFVideo(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const trimmedPrompt = prompt.slice(0, 200).trim();

  for (const modelId of HF_VIDEO_MODELS) {
    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info({ model: modelId, attempt }, "Generating video via HuggingFace");
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
            timeout: 300000,
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
          logger.info({ model: modelId, byteLength, contentType }, "HF video generated");
          return Buffer.from(response.data);
        }

        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          const errMsg: string = json?.error || "";
          logger.warn({ model: modelId, error: errMsg }, "HF video API returned non-video response");

          if (errMsg.toLowerCase().includes("loading") && attempt < 3) {
            const waitMs = COLD_START_DELAY_MS * attempt;
            if (onStatus) await onStatus(`⏳ HF model loading... waiting ${Math.round(waitMs / 1000)}s`);
            await sleep(waitMs);
            continue;
          }
        } catch {}

        break;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt < 3) {
          const waitMs = COLD_START_DELAY_MS * attempt;
          if (onStatus) await onStatus(`⏳ HF model cold start... ${Math.round(waitMs / 1000)}s`);
          logger.warn({ model: modelId, attempt }, "HF video model 503 — waiting");
          await sleep(waitMs);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId }, "HF video failed for model");
        break;
      }
    }

    const isLast = modelId === HF_VIDEO_MODELS[HF_VIDEO_MODELS.length - 1];
    if (!isLast && onStatus) await onStatus("🔄 Trying next video model...");
  }

  return null;
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function generateVideo(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  // Primary: fal.ai (stable, fast free tier) — requires FAL_KEY
  if (process.env.FAL_KEY) {
    const result = await generateFalVideo(prompt, onStatus);
    if (result) return result;
    if (onStatus) await onStatus("🔄 Fal.ai unavailable, trying fallback...");
  }

  // Fallback: HuggingFace (free but cold-start prone)
  return generateHFVideo(prompt, onStatus);
}
