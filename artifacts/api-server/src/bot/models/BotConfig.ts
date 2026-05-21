import mongoose, { Document, Schema } from "mongoose";

export interface IModelEntry {
  id: string;
  name: string;
  active: boolean;
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
}

const ModelEntrySchema = new Schema<IModelEntry>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: false },
  },
  { _id: false }
);

const BotConfigSchema = new Schema<IBotConfig>(
  {
    activeChatModel: { type: String, default: "meta-llama/llama-3.3-70b-instruct" },
    activeImageModel: { type: String, default: "black-forest-labs/FLUX.1-schnell" },
    activeVideoModel: { type: String, default: "damo-vilab/text-to-video-ms-1.7b" },
    activeVoiceModel: { type: String, default: "facebook/mms-tts-eng" },
    activeAsrModel:   { type: String, default: "openai/whisper-large-v3" },
    chatModels:  { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
    videoModels: { type: [ModelEntrySchema], default: [] },
    voiceModels: { type: [ModelEntrySchema], default: [] },
    asrModels:   { type: [ModelEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

// ── Working HuggingFace model defaults ────────────────────────────────────────

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  { id: "meta-llama/llama-3.3-70b-instruct",        name: "Llama 3.3 70B",         active: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free",    name: "Llama 3.1 8B (Free)",   active: false },
  { id: "mistralai/mistral-7b-instruct:free",        name: "Mistral 7B (Free)",     active: false },
  { id: "google/gemma-2-9b-it:free",                name: "Gemma 2 9B (Free)",     active: false },
  { id: "deepseek/deepseek-chat",                    name: "DeepSeek Chat",         active: false },
  { id: "openai/gpt-4o-mini",                       name: "GPT-4o Mini",           active: false },
  { id: "anthropic/claude-3-haiku",                 name: "Claude 3 Haiku",        active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  { id: "black-forest-labs/FLUX.1-schnell",              name: "FLUX Schnell (Fast)",    active: true  },
  { id: "black-forest-labs/FLUX.1-dev",                  name: "FLUX Dev (Quality)",     active: false },
  { id: "stabilityai/stable-diffusion-xl-base-1.0",     name: "SDXL 1.0",              active: false },
  { id: "stabilityai/stable-diffusion-3-medium-diffusers", name: "SD 3 Medium",         active: false },
  { id: "Lykon/dreamshaper-8",                          name: "Dreamshaper 8",          active: false },
  { id: "runwayml/stable-diffusion-v1-5",               name: "SD v1.5 (Reliable)",     active: false },
];

const DEFAULT_VIDEO_MODELS: IModelEntry[] = [
  { id: "damo-vilab/text-to-video-ms-1.7b",   name: "ModelScope T2V",        active: true  },
  { id: "cerspense/zeroscope_v2_576w",         name: "ZeroScope v2",          active: false },
  { id: "ali-vilab/i2vgen-xl",                name: "I2VGen-XL",             active: false },
];

const DEFAULT_VOICE_MODELS: IModelEntry[] = [
  { id: "facebook/mms-tts-eng",                  name: "Nova (Natural)",      active: true  },
  { id: "espnet/kan-bayashi_ljspeech_vits",      name: "Crystal (Smooth)",    active: false },
  { id: "facebook/fastspeech2-en-ljspeech",     name: "Echo (Warm)",         active: false },
  { id: "suno/bark-small",                       name: "Bark (Expressive)",   active: false },
];

const DEFAULT_ASR_MODELS: IModelEntry[] = [
  { id: "openai/whisper-large-v3",       name: "Whisper Large v3 (Best)",  active: true  },
  { id: "openai/whisper-medium",         name: "Whisper Medium (Fast)",    active: false },
  { id: "openai/whisper-base",           name: "Whisper Base (Fastest)",   active: false },
  { id: "facebook/wav2vec2-base-960h",   name: "Wav2Vec2 (Alternative)",   active: false },
];

// ── Bootstrap / migrate ───────────────────────────────────────────────────────

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

  // Ensure image models have FLUX if missing
  if (config.imageModels.length > 0 && !config.imageModels.find((m) => m.id.includes("FLUX"))) {
    config.imageModels.unshift(...DEFAULT_IMAGE_MODELS.slice(0, 2));
    dirty = true;
  }

  // Ensure video models have ZeroScope if missing
  if (config.videoModels.length > 0 && !config.videoModels.find((m) => m.id.includes("zeroscope"))) {
    config.videoModels.push(DEFAULT_VIDEO_MODELS[1]);
    dirty = true;
  }

  if (dirty) await config.save();
  return config;
}
