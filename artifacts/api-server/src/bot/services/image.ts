import axios from "axios";
import http from "http";
import https from "https";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

const FREE_LIMIT_DEFAULT = 5;
const PREMIUM_LIMIT_DEFAULT = 999999;

// ── HTTP agents with keep-alive — reuse connections on subsequent requests ─────
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const keepAliveAxios = axios.create({ httpAgent, httpsAgent });

// ── BotConfig in-memory cache — avoid repeated DB hits ───────────────────────
let _configCache: Awaited<ReturnType<typeof getOrCreateBotConfig>> | null = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 30_000; // refresh every 30 seconds

async function getCachedConfig() {
  const now = Date.now();
  if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;
  _configCache = await getOrCreateBotConfig();
  _configCacheAt = now;
  return _configCache;
}

export function invalidateConfigCache() {
  _configCache = null;
}

// ── Fallback image models ─────────────────────────────────────────────────────
const FALLBACK_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "SG161222/RealVisXL_V4.0",
  "Lykon/dreamshaper-8",
  "cagliostrolab/animagine-xl-4.0",
  "playgroundai/playground-v2.5-1024px-aesthetic",
  "SG161222/Realistic_Vision_V5.1_noVAE",
  "CompVis/stable-diffusion-v1-4",
  "stable-diffusion-v1-5/stable-diffusion-v1-5",
];

const IMG2IMG_ENDPOINT =
  "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix";

// ── Pollinations.ai — free, no API key required ───────────────────────────────
async function generateImagePollinations(prompt: string): Promise<Buffer | null> {
  try {
    const seed = Math.floor(Math.random() * 2147483647);
    const encoded = encodeURIComponent(prompt);
    // flux-schnell is 4x faster than flux; 768px is faster to download than 1024px
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&model=flux-schnell&seed=${seed}&enhance=false`;
    logger.info({ seed }, "Attempting image generation via Pollinations.ai (flux-schnell)");
    const response = await keepAliveAxios.get(url, {
      responseType: "arraybuffer",
      timeout: 55000,
      headers: { "User-Agent": "Nova-Bot/1.0" },
    });
    const buf = Buffer.from(response.data);
    if (buf.byteLength > 5000) {
      logger.info({ bytes: buf.byteLength }, "Pollinations.ai image generated successfully");
      return buf;
    }
    logger.warn({ bytes: buf.byteLength }, "Pollinations.ai returned too-small response");
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Pollinations.ai image generation failed");
    return null;
  }
}

// ── HuggingFace image generation ──────────────────────────────────────────────
async function generateImageHuggingFace(prompt: string, config: Awaited<ReturnType<typeof getCachedConfig>>): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const primaryModel = config.activeImageModel;
  const allModels = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  for (const modelId of allModels) {
    const url = `https://api-inference.huggingface.co/models/${modelId}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info({ model: modelId, attempt }, "Attempting HF image generation");
        const response = await keepAliveAxios.post(
          url,
          { inputs: prompt },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "image/png",
              "X-Wait-For-Model": "true",
            },
            responseType: "arraybuffer",
            timeout: 90000,
          }
        );
        const contentType = (response.headers["content-type"] as string) || "";
        if (contentType.includes("image") || (response.data as Buffer)?.byteLength > 1000) {
          logger.info({ model: modelId }, "HF image generated successfully");
          return Buffer.from(response.data);
        }
        logger.warn({ model: modelId, contentType }, "Response was not an image, trying next model");
        break;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt === 1) {
          logger.warn({ model: modelId }, "Image model loading (503) — retrying after 5s");
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        logger.warn({ model: modelId, status }, "Image generation failed for this model");
        break;
      }
    }
  }
  return null;
}

// ── Main export — races providers in parallel when both available ──────────────
export async function generateImage(
  prompt: string,
  context?: "free" | "premium" | "group"
): Promise<Buffer | null> {
  const config = await getCachedConfig();
  const providers = config.providers;

  let imageProvider: "huggingface" | "pollinations" = "pollinations";
  if (context === "premium") {
    imageProvider = providers?.premiumImage ?? "huggingface";
  } else if (context === "group") {
    imageProvider = providers?.groupImage ?? "pollinations";
  } else {
    imageProvider = providers?.freeImage ?? "pollinations";
  }

  logger.info({ context, imageProvider }, "Generating image");

  const hasHF = !!process.env.HUGGINGFACE_API_TOKEN;

  if (imageProvider === "huggingface") {
    if (!hasHF) {
      // No HF token, fall straight to Pollinations
      return generateImagePollinations(prompt);
    }
    // Race HF (primary) vs Pollinations (fallback) in parallel — fastest wins
    return raceImageProviders(prompt, config, /* hfPrimary */ true);
  }

  // Pollinations is primary
  if (hasHF) {
    // Race Pollinations (primary) vs HF (fallback) — fastest wins
    return raceImageProviders(prompt, config, /* hfPrimary */ false);
  }

  // Pollinations only
  return generateImagePollinations(prompt);
}

/**
 * Fire both providers simultaneously. Return the first successful result.
 * If the non-primary finishes first but the primary is still running, wait a
 * brief grace period so the preferred provider can still win; otherwise take
 * whatever comes back first.
 */
async function raceImageProviders(
  prompt: string,
  config: Awaited<ReturnType<typeof getCachedConfig>>,
  hfPrimary: boolean
): Promise<Buffer | null> {
  type Result = { buf: Buffer | null; source: string };

  const pollinationsPromise: Promise<Result> = generateImagePollinations(prompt).then(buf => ({ buf, source: "pollinations" }));
  const hfPromise: Promise<Result> = generateImageHuggingFace(prompt, config).then(buf => ({ buf, source: "hf" }));

  const [primary, secondary] = hfPrimary
    ? [hfPromise, pollinationsPromise]
    : [pollinationsPromise, hfPromise];

  // Use Promise.any so we get the first non-null result
  try {
    const result = await Promise.any([
      primary.then(r => { if (!r.buf) throw new Error("null"); return r; }),
      secondary.then(r => { if (!r.buf) throw new Error("null"); return r; }),
    ]);
    logger.info({ source: result.source }, "Image generated (race winner)");
    return result.buf;
  } catch {
    // Both failed
    logger.warn("Both image providers failed");
    return null;
  }
}

/**
 * Edit an existing image using a text instruction (img2img).
 */
export async function editImage(
  imageBuffer: Buffer,
  prompt: string
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const base64Image = imageBuffer.toString("base64");

  try {
    logger.info({ endpoint: IMG2IMG_ENDPOINT }, "Attempting img2img");
    const response = await keepAliveAxios.post(
      IMG2IMG_ENDPOINT,
      {
        inputs: base64Image,
        parameters: {
          prompt,
          num_inference_steps: 15,
          image_guidance_scale: 1.5,
          guidance_scale: 7,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 90000,
      }
    );

    const contentType = (response.headers["content-type"] as string) || "";
    const rawData = response.data as Buffer;

    if (contentType.includes("image") && rawData?.byteLength > 1000) {
      logger.info("img2img succeeded (raw binary)");
      return Buffer.from(rawData);
    }

    try {
      const json = JSON.parse(rawData.toString("utf-8"));
      const b64 =
        (Array.isArray(json) ? json[0]?.generated_image : json?.generated_image) ||
        json?.image ||
        (Array.isArray(json) ? json[0]?.image : null);
      if (b64 && typeof b64 === "string") {
        logger.info("img2img succeeded (JSON base64)");
        return Buffer.from(b64, "base64");
      }
    } catch {
      if (rawData?.byteLength > 1000) {
        logger.info("img2img succeeded (raw, non-image content-type)");
        return Buffer.from(rawData);
      }
    }

    logger.warn({ contentType, byteLength: rawData?.byteLength }, "img2img response unrecognised — falling back");
  } catch (err: any) {
    logger.warn({ err: err?.message, status: err?.response?.status }, "img2img failed — falling back");
  }

  return generateImage(prompt);
}

/**
 * Download an image from Telegram's CDN using a file_id.
 */
export async function downloadTelegramPhoto(
  bot: import("node-telegram-bot-api"),
  fileId: string
): Promise<Buffer | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const file = await bot.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await keepAliveAxios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    return Buffer.from(response.data);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to download Telegram photo");
    return null;
  }
}

export async function getImageLimit(isPremium: boolean): Promise<number> {
  try {
    const config = await getCachedConfig();
    const n = isPremium ? config.usageLimits.premiumImages : config.usageLimits.freeImages;
    return n < 0 ? 999999 : n;
  } catch {
    return isPremium ? PREMIUM_LIMIT_DEFAULT : FREE_LIMIT_DEFAULT;
  }
}

const STYLE_PRESETS: Record<string, string> = {
  anime:      "anime style, vibrant colors, cel-shaded, sharp outlines, Studio Ghibli inspired, beautiful",
  realistic:  "photorealistic, 8K resolution, ultra-detailed, professional photography, natural lighting",
  oil:        "oil painting, thick brushstrokes, impressionist style, canvas texture, rich colors, museum quality",
  watercolor: "watercolor painting, soft washes, delicate brushwork, pastel tones, artistic",
  cyberpunk:  "cyberpunk style, neon lights, futuristic city, rain-slicked streets, dark atmosphere, cinematic",
  fantasy:    "fantasy art, magical, ethereal lighting, epic scale, detailed world-building, concept art",
  sketch:     "pencil sketch, detailed line art, black and white, cross-hatching, professional illustration",
  pixel:      "pixel art, 16-bit style, retro game aesthetic, vibrant palette, crisp pixels",
};

export function applyStylePreset(prompt: string, preset?: string): string {
  if (!preset) return prompt;
  const style = STYLE_PRESETS[preset.toLowerCase()];
  if (!style) return prompt;
  return `${prompt}, ${style}`;
}

export function listStylePresets(): string[] {
  return Object.keys(STYLE_PRESETS);
}
