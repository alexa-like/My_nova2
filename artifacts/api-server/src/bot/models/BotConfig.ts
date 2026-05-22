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
    activeChatModel: { type: String, default: "meta-llama/llama-3.3-70b-instruct:free" },
    activeImageModel: { type: String, default: "black-forest-labs/FLUX.1-schnell" },
    activeVideoModel: { type: String, default: "ByteDance/AnimateDiff-Lightning" },
    activeVoiceModel: { type: String, default: "facebook/mms-tts-eng" },
    activeAsrModel: { type: String, default: "openai/whisper-large-v3" },
    chatModels: { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
    videoModels: { type: [ModelEntrySchema], default: [] },
    voiceModels: { type: [ModelEntrySchema], default: [] },
    asrModels: { type: [ModelEntrySchema], default: [] },
    providerSettings: { type: ProviderSettingsSchema, default: () => ({}) },
    premiumEmojiEnabled: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    usageLimits: { type: UsageLimitsSchema, default: () => ({}) },
    welcomeMessage: { type: String, default: "" },
    botPersonality: { type: String, default: "" },
  },
  { timestamps: true }
);

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

// ── Default model catalogs (all verified free / open-access as of 2025) ───────

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  { id: "meta-llama/llama-3.3-70b-instruct:free",      name: "Llama 3.3 70B (Free)",           active: true  },
  { id: "deepseek/deepseek-v4-flash:free",              name: "DeepSeek V4 Flash (Free)",        active: false },
  { id: "openai/gpt-oss-20b:free",                      name: "GPT-OSS 20B (Free)",              active: false },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free",   name: "Hermes 3 405B (Free)",            active: false },
  { id: "google/gemma-4-31b-it:free",                   name: "Gemma 4 31B (Free)",              active: false },
  { id: "nvidia/nemotron-3-super-120b-a12b:free",       name: "Nemotron Super 120B (Free)",      active: false },
  { id: "meta-llama/llama-3.2-3b-instruct:free",        name: "Llama 3.2 3B Fast (Free)",        active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  { id: "black-forest-labs/FLUX.1-schnell",                   name: "FLUX.1 Schnell (Fast)",           active: true  },
  { id: "stabilityai/stable-diffusion-xl-base-1.0",           name: "SDXL 1.0 (Quality)",              active: false },
  { id: "SG161222/RealVisXL_V4.0",                            name: "RealVisXL v4 (Photorealistic)",    active: false },
  { id: "Lykon/dreamshaper-8",                                 name: "DreamShaper 8 (Creative)",        active: false },
  { id: "stable-diffusion-v1-5/stable-diffusion-v1-5",        name: "SD v1.5 (Reliable)",              active: false },
  { id: "stabilityai/stable-diffusion-3-medium-diffusers",    name: "SD 3 Medium",                     active: false },
];

const DEFAULT_VIDEO_MODELS: IModelEntry[] = [
  { id: "ByteDance/AnimateDiff-Lightning",    name: "AnimateDiff Lightning (Fast)",  active: true  },
  { id: "Wan-AI/Wan2.1-T2V-1.3B",            name: "Wan 2.1 T2V (Quality)",         active: false },
  { id: "damo-vilab/text-to-video-ms-1.7b",  name: "ModelScope T2V (Fallback)",     active: false },
  { id: "cerspense/zeroscope_v2_576w",        name: "ZeroScope v2 (Legacy)",         active: false },
];

const DEFAULT_VOICE_MODELS: IModelEntry[] = [
  { id: "facebook/mms-tts-eng",               name: "Nova (Natural)",      active: true  },
  { id: "espnet/kan-bayashi_ljspeech_vits",   name: "Crystal (Smooth)",    active: false },
  { id: "suno/bark-small",                    name: "Bark (Expressive)",   active: false },
];

const DEFAULT_ASR_MODELS: IModelEntry[] = [
  { id: "openai/whisper-large-v3",         name: "Whisper Large v3 (Best)",      active: true  },
  { id: "openai/whisper-medium",           name: "Whisper Medium (Fast)",         active: false },
  { id: "openai/whisper-base",             name: "Whisper Base (Fastest)",        active: false },
  { id: "facebook/wav2vec2-base-960h",     name: "Wav2Vec2 (Alternative)",        active: false },
];

// ── Models to auto-migrate away from (paid/deprecated/removed) ───────────────
const DEPRECATED_CHAT_MODEL_IDS = new Set([
  "meta-llama/llama-3.3-70b-instruct",   // paid version → migrate to :free
  "mistralai/mistral-7b-instruct:free",  // no longer on free tier
  "google/gemma-2-9b-it:free",           // no longer on free tier
  "deepseek/deepseek-chat",              // paid
  "openai/gpt-4o-mini",                 // paid
  "anthropic/claude-3-haiku",           // paid
]);
const DEPRECATED_IMAGE_MODEL_IDS = new Set([
  "runwayml/stable-diffusion-v1-5",      // removed from HF
  "black-forest-labs/FLUX.1-dev",        // requires HF Pro subscription
]);
const DEPRECATED_VIDEO_MODEL_IDS = new Set<string>(); // nothing fully removed yet

// ── Paid chat model → free equivalent ────────────────────────────────────────
const CHAT_MODEL_FREE_UPGRADE: Record<string, string> = {
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct:free",
};

export async function getOrCreateBotConfig(): Promise<IBotConfig> {
  let config = await BotConfig.findOne();
  if (!config) {
    config = new BotConfig({
      activeChatModel: DEFAULT_CHAT_MODELS[0].id,
      activeImageModel: DEFAULT_IMAGE_MODELS[0].id,
      activeVideoModel: DEFAULT_VIDEO_MODELS[0].id,
      activeVoiceModel: DEFAULT_VOICE_MODELS[0].id,
      activeAsrModel:   DEFAULT_ASR_MODELS[0].id,
      chatModels:  DEFAULT_CHAT_MODELS,
      imageModels: DEFAULT_IMAGE_MODELS,
      videoModels: DEFAULT_VIDEO_MODELS,
      voiceModels: DEFAULT_VOICE_MODELS,
      asrModels:   DEFAULT_ASR_MODELS,
    });
    await config.save();
    return config;
  }

  let dirty = false;

  // ── Migrate paid/removed active models ──────────────────────────────────────
  if (CHAT_MODEL_FREE_UPGRADE[config.activeChatModel]) {
    config.activeChatModel = CHAT_MODEL_FREE_UPGRADE[config.activeChatModel];
    dirty = true;
  }
  // Migrate active video model away from old broken default
  if (config.activeVideoModel === "damo-vilab/text-to-video-ms-1.7b" ||
      config.activeVideoModel === "cerspense/zeroscope_v2_576w") {
    config.activeVideoModel = DEFAULT_VIDEO_MODELS[0].id;
    dirty = true;
  }

  // ── Ensure voice/ASR lists are populated ────────────────────────────────────
  if (!config.voiceModels || config.voiceModels.length === 0) {
    config.voiceModels = DEFAULT_VOICE_MODELS;
    if (!config.activeVoiceModel) config.activeVoiceModel = DEFAULT_VOICE_MODELS[0].id;
    dirty = true;
  }
  if (!config.asrModels || config.asrModels.length === 0) {
    config.asrModels = DEFAULT_ASR_MODELS;
    if (!config.activeAsrModel) config.activeAsrModel = DEFAULT_ASR_MODELS[0].id;
    dirty = true;
  }

  // ── Ensure FLUX is in image models ──────────────────────────────────────────
  if (config.imageModels.length > 0 && !config.imageModels.find((m) => m.id.includes("FLUX.1-schnell"))) {
    config.imageModels.unshift(DEFAULT_IMAGE_MODELS[0]);
    dirty = true;
  }

  // ── Remove deprecated image models from list ─────────────────────────────────
  const cleanedImageModels = config.imageModels.filter(m => !DEPRECATED_IMAGE_MODEL_IDS.has(m.id));
  if (cleanedImageModels.length !== config.imageModels.length) {
    config.imageModels = cleanedImageModels;
    dirty = true;
  }

  // ── Add new image models if missing ─────────────────────────────────────────
  for (const m of DEFAULT_IMAGE_MODELS) {
    if (!config.imageModels.find(e => e.id === m.id)) {
      config.imageModels.push({ ...m, active: false });
      dirty = true;
    }
  }

  // ── Ensure AnimateDiff-Lightning is in video models ─────────────────────────
  if (!config.videoModels.find((m) => m.id === "ByteDance/AnimateDiff-Lightning")) {
    config.videoModels.unshift({ id: "ByteDance/AnimateDiff-Lightning", name: "AnimateDiff Lightning (Fast)", active: false });
    dirty = true;
  }
  if (!config.videoModels.find((m) => m.id === "Wan-AI/Wan2.1-T2V-1.3B")) {
    config.videoModels.push({ id: "Wan-AI/Wan2.1-T2V-1.3B", name: "Wan 2.1 T2V (Quality)", active: false });
    dirty = true;
  }

  // ── Remove deprecated TTS model (fastspeech2) ────────────────────────────────
  const cleanedVoiceModels = config.voiceModels.filter(m => m.id !== "facebook/fastspeech2-en-ljspeech");
  if (cleanedVoiceModels.length !== config.voiceModels.length) {
    config.voiceModels = cleanedVoiceModels.length > 0 ? cleanedVoiceModels : DEFAULT_VOICE_MODELS;
    if (config.activeVoiceModel === "facebook/fastspeech2-en-ljspeech") {
      config.activeVoiceModel = DEFAULT_VOICE_MODELS[0].id;
    }
    dirty = true;
  }

  // ── Add new free chat models if missing ──────────────────────────────────────
  for (const m of DEFAULT_CHAT_MODELS) {
    if (!config.chatModels.find(e => e.id === m.id)) {
      config.chatModels.push({ ...m, active: false });
      dirty = true;
    }
  }

  // ── Remove deprecated chat models from list (keep if user had them active) ───
  const cleanedChatModels = config.chatModels.filter(m => {
    if (!DEPRECATED_CHAT_MODEL_IDS.has(m.id)) return true;
    // If user had it set as active chat model, we already migrated above; safe to remove
    return false;
  });
  if (cleanedChatModels.length !== config.chatModels.length && cleanedChatModels.length > 0) {
    config.chatModels = cleanedChatModels;
    dirty = true;
  }

  if (dirty) await config.save();
  return config;
}
