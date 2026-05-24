import axios from "axios";
import http from "http";
import https from "https";
import { logger } from "../../lib/logger.js";

const FREE_LIMIT_DEFAULT = 5;
const PREMIUM_LIMIT_DEFAULT = 999999;

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const keepAliveAxios = axios.create({ httpAgent, httpsAgent });

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

// ── Pollinations.ai — free, no API key, very reliable ────────────────────────
async function generateImagePollinations(prompt: string): Promise<Buffer | null> {
  try {
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}&enhance=true`;
    logger.info({ prompt: prompt.slice(0, 60) }, "Generating image via Pollinations.ai");
    const response = await keepAliveAxios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: { "User-Agent": "Nova-Bot/1.0" },
    });
    const buf = Buffer.from(response.data);
    if (buf.byteLength > 5000) {
      logger.info({ bytes: buf.byteLength }, "Pollinations image generated");
      return buf;
    }
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message, status: err?.response?.status }, "Pollinations image generation failed");
    return null;
  }
}

// ── HuggingFace fallback — requires token ─────────────────────────────────────
async function generateImageHuggingFace(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;
  const models = [
    "stabilityai/stable-diffusion-xl-base-1.0",
    "black-forest-labs/FLUX.1-schnell",
    "Lykon/dreamshaper-8",
  ];
  for (const modelId of models) {
    const url = `https://api-inference.huggingface.co/models/${modelId}`;
    try {
      logger.info({ model: modelId }, "Attempting HuggingFace image generation (fallback)");
      const response = await keepAliveAxios.post(
        url,
        { inputs: prompt },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Wait-For-Model": "true",
          },
          responseType: "arraybuffer",
          timeout: 90000,
        }
      );
      const buf = Buffer.from(response.data);
      const ct = (response.headers["content-type"] as string) || "";
      if (ct.includes("image") || buf.byteLength > 5000) {
        logger.info({ model: modelId }, "HF image generated");
        return buf;
      }
    } catch (err: any) {
      logger.warn({ model: modelId, status: err?.response?.status }, "HF model failed");
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateImage(
  prompt: string,
  _context?: "free" | "premium" | "group"
): Promise<Buffer | null> {
  // Try Pollinations first (free, no key needed)
  const pollinationsResult = await generateImagePollinations(prompt);
  if (pollinationsResult) return pollinationsResult;

  // Fallback to HuggingFace if token is set
  logger.warn("Pollinations failed — trying HuggingFace fallback");
  return generateImageHuggingFace(prompt);
}

// ── Image editing via img2img ──────────────────────────────────────────────────
export async function editImage(
  imageBuffer: Buffer,
  prompt: string
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    // Fallback: just regenerate with the prompt since no token
    return generateImage(prompt);
  }
  const endpoint = "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix";
  try {
    const base64Image = imageBuffer.toString("base64");
    const response = await keepAliveAxios.post(
      endpoint,
      { inputs: base64Image, parameters: { prompt, num_inference_steps: 15, image_guidance_scale: 1.5, guidance_scale: 7 } },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, responseType: "arraybuffer", timeout: 90000 }
    );
    const buf = Buffer.from(response.data);
    const ct = (response.headers["content-type"] as string) || "";
    if (ct.includes("image") && buf.byteLength > 5000) return buf;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "img2img failed — falling back to generation");
  }
  return generateImage(prompt);
}

// ── Download Telegram photo ───────────────────────────────────────────────────
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
    const { getOrCreateBotConfig } = await import("../models/BotConfig.js");
    const config = await getOrCreateBotConfig();
    const n = isPremium ? config.usageLimits.premiumImages : config.usageLimits.freeImages;
    return n < 0 ? 999999 : n;
  } catch {
    return isPremium ? PREMIUM_LIMIT_DEFAULT : FREE_LIMIT_DEFAULT;
  }
}

export function applyStylePreset(prompt: string, preset?: string): string {
  if (!preset) return prompt;
  const style = STYLE_PRESETS[preset.toLowerCase()];
  if (!style) return prompt;
  return `${prompt}, ${style}`;
}

export function listStylePresets(): string[] {
  return Object.keys(STYLE_PRESETS);
}
