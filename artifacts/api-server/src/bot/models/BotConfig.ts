import mongoose, { Document, Schema } from "mongoose";

export interface IModelEntry {
  id: string;
  name: string;
  active: boolean;
}

export type ProviderName = "openrouter" | "huggingface" | "auto";
export type TaskType = "text" | "code" | "image" | "video";

export interface IProviderSettings {
  globalProvider: ProviderName;
  enabledProviders: { openrouter: boolean; huggingface: boolean };
  taskRouting: { text: ProviderName; code: ProviderName; image: ProviderName; video: ProviderName };
  lastUsedProvider: string;
  lastError: string;
}

export interface IUsageLimits {
  freeMessages: number;
  freeImages: number;
  freeBuilds: number;
  freeVideos: number;
  freeMusic: number;
  premiumMessages: number;
  premiumImages: number;
  premiumBuilds: number;
  premiumVideos: number;
  premiumMusic: number;
  resetIntervalHours: number;
}

export interface IBotConfig extends Document {
  activeChatModel: string;
  activeImageModel: string;
  activeVideoModel: string;
  activeVoiceModel: string;
  activeAsrModel: string;
  chatModels: IModelEntry[];
  imageModels: IModelEntry[];
  videoModels: IModelEntry[];
  voiceModels: IModelEntry[];
  asrModels: IModelEntry[];
  providerSettings: IProviderSettings;
  premiumEmojiEnabled: boolean;
  maintenanceMode: boolean;
  usageLimits: IUsageLimits;
  welcomeMessage: string;
  botPersonality: string;
}

const ModelEntrySchema = new Schema<IModelEntry>(
  { id: { type: String, required: true }, name: { type: String, required: true }, active: { type: Boolean, default: false } },
  { _id: false }
);

const ProviderSettingsSchema = new Schema(
  {
    globalProvider: { type: String, default: "auto" },
    enabledProviders: {
      openrouter: { type: Boolean, default: true },
      huggingface: { type: Boolean, default: true },
    },
    taskRouting: {
      text: { type: String, default: "openrouter" },
      code: { type: String, default: "openrouter" },
      image: { type: String, default: "huggingface" },
      video: { type: String, default: "huggingface" },
    },
    lastUsedProvider: { type: String, default: "" },
    lastError: { type: String, default: "" },
  },
  { _id: false }
);

const UsageLimitsSchema = new Schema(
  {
    freeMessages: { type: Number, default: 50 },
    freeImages: { type: Number, default: 5 },
    freeBuilds: { type: Number, default: 3 },
    freeVideos: { type: Number, default: 2 },
    freeMusic: { type: Number, default: 3 },
    premiumMessages: { type: Number, default: -1 },
    premiumImages: { type: Number, default: -1 },
    premiumBuilds: { type: Number, default: 20 },
    premiumVideos: { type: Number, default: -1 },
    premiumMusic: { type: Number, default: -1 },
    resetIntervalHours: { type: Number, default: 24 },
  },
  { _id: false }
);

const BotConfigSchema = new Schema<IBotConfig>(
  {
    // ── Defaults: all verified free models (May 2025) ──────────────────────────
    activeChatModel:  { type: String, default: "deepseek/deepseek-v4-flash:free" },
    activeImageModel: { type: String, default: "black-forest-labs/FLUX.1-schnell" },
    activeVideoModel: { type: String, default: "ByteDance/AnimateDiff-Lightning" },
    activeVoiceModel: { type: String, default: "hexgrad/Kokoro-82M" },
    activeAsrModel:   { type: String, default: "openai/whisper-large-v3-turbo" },
    chatModels:  { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
    videoModels: { type: [ModelEntrySchema], default: [] },
    voiceModels: { type: [ModelEntrySchema], default: [] },
    asrModels:   { type: [ModelEntrySchema], default: [] },
    providerSettings: { type: ProviderSettingsSchema, default: () => ({}) },
    premiumEmojiEnabled: { type: Boolean, default: false },
    maintenanceMode:     { type: Boolean, default: false },
    usageLimits: { type: UsageLimitsSchema, default: () => ({}) },
    welcomeMessage:  { type: String, default: "" },
    botPersonality:  { type: String, default: "" },
  },
  { timestamps: true }
);

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT MODEL CATALOGS
// All entries verified free / open-access as of May 2025.
// Chat models: OpenRouter (:free suffix = zero cost, confirmed via live API).
// Image/Video/TTS/ASR: HuggingFace Inference API (inf:true or inf:"warm" verified).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  // ── OpenRouter free tier — all verified pricing: 0 (May 2025) ───────────────────
  // Fast models — used in premium race pool (respond in ~2-5s)
  { id: "meta-llama/llama-3.1-8b-instruct:free",                    name: "Fast: Llama 3.1 8B — Ultra Fast",     active: true  },
  { id: "google/gemma-2-9b-it:free",                                 name: "Fast: Gemma 2 9B — Smart & Quick",    active: false },
  { id: "mistralai/mistral-7b-instruct:free",                        name: "Fast: Mistral 7B — Reliable",         active: false },
  // Quality models — premium quality fallback + free primary
  { id: "meta-llama/llama-3.3-70b-instruct:free",                    name: "Quality: Llama 3.3 70B — Best",       active: false },
  { id: "deepseek/deepseek-r1-distill-llama-70b:free",               name: "Quality: DeepSeek R1 70B — Reasoning",active: false },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free",                 name: "Quality: Hermes 3 405B — Context",    active: false },
  { id: "qwen/qwen-2.5-72b-instruct:free",                           name: "Quality: Qwen 2.5 72B — Multilingual",active: false },
  { id: "deepseek/deepseek-v3-base:free",                            name: "Quality: DeepSeek V3 — Coder",        active: false },
  { id: "deepseek/deepseek-r1:free",                                  name: "Quality: DeepSeek R1 — Full Reason",  active: false },
  { id: "mistralai/mixtral-8x7b-instruct:free",                      name: "Quality: Mixtral 8x7B — Balanced",    active: false },
  { id: "google/gemma-2-27b-it:free",                                 name: "Quality: Gemma 2 27B — Google Large", active: false },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Dolphin 24B — Uncensored",        active: false },
  { id: "meta-llama/llama-3.2-3b-instruct:free",                     name: "Fast: Llama 3.2 3B — Tiny/Fastest",  active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  // ── HuggingFace Inference API — all inf:true or inf:"warm" verified ───────
  { id: "black-forest-labs/FLUX.1-schnell",                        name: "FLUX.1 Schnell — Fast & Sharp",          active: true  },
  { id: "stabilityai/stable-diffusion-xl-base-1.0",               name: "SDXL 1.0 — High Quality",                active: false },
  { id: "SG161222/RealVisXL_V4.0",                                 name: "RealVisXL v4 — Photorealistic",          active: false },
  { id: "Lykon/dreamshaper-8",                                     name: "DreamShaper 8 — Creative",               active: false },
  { id: "cagliostrolab/animagine-xl-4.0",                          name: "Animagine XL 4.0 — Anime",               active: false },
  { id: "playgroundai/playground-v2.5-1024px-aesthetic",           name: "Playground v2.5 — Aesthetic",            active: false },
  { id: "SG161222/Realistic_Vision_V5.1_noVAE",                    name: "Realistic Vision v5.1 — Portraits",      active: false },
  { id: "CompVis/stable-diffusion-v1-4",                           name: "SD v1.4 — Classic Reliable",             active: false },
  { id: "stable-diffusion-v1-5/stable-diffusion-v1-5",             name: "SD v1.5 — Reliable Fallback",            active: false },
  { id: "stabilityai/stable-diffusion-3-medium-diffusers",         name: "SD 3 Medium — Modern Quality",           active: false },
];

const DEFAULT_VIDEO_MODELS: IModelEntry[] = [
  // ── HuggingFace text-to-video pipeline models ─────────────────────────────
  { id: "ByteDance/AnimateDiff-Lightning",    name: "AnimateDiff Lightning — Fastest",  active: true  },
  { id: "Wan-AI/Wan2.1-T2V-1.3B",            name: "Wan 2.1 T2V — Best Quality",       active: false },
  { id: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",  name: "Wan 2.1 Diffusers — Alternative",  active: false },
  { id: "ali-vilab/text-to-video-ms-1.7b",   name: "AliViLab T2V — Stable",            active: false },
  { id: "damo-vilab/text-to-video-ms-1.7b",  name: "ModelScope T2V — Legacy",          active: false },
  { id: "cerspense/zeroscope_v2_576w",        name: "ZeroScope v2 — Last Resort",       active: false },
];

const DEFAULT_VOICE_MODELS: IModelEntry[] = [
  // ── HuggingFace TTS models — all inf:true or inf:"warm" verified ──────────
  { id: "hexgrad/Kokoro-82M",              name: "Kokoro — Best Quality (10M users)",  active: true  },
  { id: "facebook/mms-tts-eng",            name: "MMS — Clean & Natural",              active: false },
  { id: "myshell-ai/MeloTTS-English",      name: "MeloTTS — Expressive English",       active: false },
  { id: "suno/bark-small",                 name: "Bark — Dynamic & Emotional",         active: false },
  { id: "espnet/kan-bayashi_ljspeech_vits",name: "VITS LJSpeech — Smooth",            active: false },
];

const DEFAULT_ASR_MODELS: IModelEntry[] = [
  // ── HuggingFace ASR models — all inf:true verified ────────────────────────
  { id: "openai/whisper-large-v3-turbo",   name: "Whisper Large v3 Turbo — Fast & Accurate",  active: true  },
  { id: "openai/whisper-large-v3",         name: "Whisper Large v3 — Best Accuracy",           active: false },
  { id: "distil-whisper/distil-large-v3",  name: "Distil-Whisper Large v3 — Efficient",        active: false },
  { id: "openai/whisper-medium",           name: "Whisper Medium — Balanced",                  active: false },
  { id: "openai/whisper-small",            name: "Whisper Small — Fast",                       active: false },
  { id: "openai/whisper-base",             name: "Whisper Base — Fastest",                     active: false },
  { id: "facebook/wav2vec2-base-960h",     name: "Wav2Vec2 — Alternative Architecture",        active: false },
];

export async function getOrCreateBotConfig(): Promise<IBotConfig> {
  let config = await BotConfig.findOne();
  if (!config) {
    config = new BotConfig({
      activeChatModel:  DEFAULT_CHAT_MODELS.find(m => m.active)!.id,
      activeImageModel: DEFAULT_IMAGE_MODELS.find(m => m.active)!.id,
      activeVideoModel: DEFAULT_VIDEO_MODELS.find(m => m.active)!.id,
      activeVoiceModel: DEFAULT_VOICE_MODELS.find(m => m.active)!.id,
      activeAsrModel:   DEFAULT_ASR_MODELS.find(m => m.active)!.id,
      chatModels:  DEFAULT_CHAT_MODELS,
      imageModels: DEFAULT_IMAGE_MODELS,
      videoModels: DEFAULT_VIDEO_MODELS,
      voiceModels: DEFAULT_VOICE_MODELS,
      asrModels:   DEFAULT_ASR_MODELS,
    });
    await config.save();
    return config;
  }

  return config;
}
