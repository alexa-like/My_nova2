import mongoose, { Document, Schema } from "mongoose";

export interface IModelEntry {
  id: string;
  name: string;
  active: boolean;
}

export type ChatProvider = "openrouter" | "pollinations";
export type ImageProvider = "huggingface" | "pollinations";
export type TtsProvider = "huggingface" | "openrouter";

export interface IProviderSlot {
  provider: ChatProvider;
  model: string;
}

export interface IProviders {
  freeChat: IProviderSlot;
  premiumChat: IProviderSlot;
  groupChat: IProviderSlot;
  freeImage: ImageProvider;
  premiumImage: ImageProvider;
  groupImage: ImageProvider;
  tts: TtsProvider;
  ttsVoice: string;
}

export interface IFeatures {
  imageEnabled: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  imageAnalysisEnabled: boolean;
}

export interface IUsageLimits {
  freeMessages: number;
  freeImages: number;
  freeBuilds: number;
  premiumMessages: number;
  premiumImages: number;
  premiumBuilds: number;
  resetIntervalHours: number;
}

export interface IBotConfig extends Document {
  activeChatModel: string;
  activeImageModel: string;
  chatModels: IModelEntry[];
  imageModels: IModelEntry[];
  premiumEmojiEnabled: boolean;
  maintenanceMode: boolean;
  usageLimits: IUsageLimits;
  welcomeMessage: string;
  botPersonality: string;
  providers: IProviders;
  features: IFeatures;
}

const ModelEntrySchema = new Schema<IModelEntry>(
  { id: { type: String, required: true }, name: { type: String, required: true }, active: { type: Boolean, default: false } },
  { _id: false }
);

const UsageLimitsSchema = new Schema(
  {
    freeMessages:    { type: Number, default: 50 },
    freeImages:      { type: Number, default: 5 },
    freeBuilds:      { type: Number, default: 3 },
    premiumMessages: { type: Number, default: -1 },
    premiumImages:   { type: Number, default: -1 },
    premiumBuilds:   { type: Number, default: 20 },
    resetIntervalHours: { type: Number, default: 24 },
  },
  { _id: false }
);

const ProviderSlotSchema = new Schema<IProviderSlot>(
  {
    provider: { type: String, enum: ["openrouter", "pollinations"], default: "pollinations" },
    model: { type: String, default: "openai" },
  },
  { _id: false }
);

const ProvidersSchema = new Schema<IProviders>(
  {
    freeChat:    { type: ProviderSlotSchema, default: () => ({ provider: "pollinations", model: "openai" }) },
    premiumChat: { type: ProviderSlotSchema, default: () => ({ provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" }) },
    groupChat:   { type: ProviderSlotSchema, default: () => ({ provider: "pollinations", model: "openai" }) },
    freeImage:    { type: String, enum: ["huggingface", "pollinations"], default: "pollinations" },
    premiumImage: { type: String, enum: ["huggingface", "pollinations"], default: "huggingface" },
    groupImage:   { type: String, enum: ["huggingface", "pollinations"], default: "pollinations" },
    tts:      { type: String, enum: ["huggingface", "openrouter"], default: "huggingface" },
    ttsVoice: { type: String, default: "alloy" },
  },
  { _id: false }
);

const FeaturesSchema = new Schema<IFeatures>(
  {
    imageEnabled:        { type: Boolean, default: true },
    ttsEnabled:          { type: Boolean, default: true },
    sttEnabled:          { type: Boolean, default: true },
    imageAnalysisEnabled:{ type: Boolean, default: true },
  },
  { _id: false }
);

const BotConfigSchema = new Schema<IBotConfig>(
  {
    activeChatModel:  { type: String, default: "meta-llama/llama-3.3-70b-instruct:free" },
    activeImageModel: { type: String, default: "stabilityai/stable-diffusion-xl-base-1.0" },
    chatModels:  { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
    premiumEmojiEnabled: { type: Boolean, default: false },
    maintenanceMode:     { type: Boolean, default: false },
    usageLimits: { type: UsageLimitsSchema, default: () => ({}) },
    welcomeMessage:  { type: String, default: "" },
    botPersonality:  { type: String, default: "" },
    providers: { type: ProvidersSchema, default: () => ({}) },
    features:  { type: FeaturesSchema,  default: () => ({}) },
  },
  { timestamps: true }
);

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  { id: "meta-llama/llama-3.3-70b-instruct:free",               name: "Llama 3.3 70B — Best Quality",         active: true  },
  { id: "google/gemma-4-31b-it:free",                            name: "Gemma 4 31B — Google",                 active: false },
  { id: "deepseek/deepseek-v4-flash:free",                       name: "DeepSeek V4 Flash — Fast",             active: false },
  { id: "qwen/qwen3-coder:free",                                 name: "Qwen3 Coder — Code & Chat",            active: false },
  { id: "openai/gpt-oss-20b:free",                               name: "GPT OSS 20B — OpenAI Free",            active: false },
  { id: "nvidia/nemotron-3-super-120b-a12b:free",                name: "Nemotron 120B — NVIDIA",               active: false },
  { id: "microsoft/phi-4:free",                                  name: "Phi-4 — Reliable Mid-Size",            active: false },
  { id: "mistralai/mistral-7b-instruct:free",                    name: "Mistral 7B — Fast & Reliable",         active: false },
  { id: "meta-llama/llama-3.1-8b-instruct:free",                 name: "Llama 3.1 8B — Ultra Fast",            active: false },
  { id: "meta-llama/llama-3.2-3b-instruct:free",                 name: "Llama 3.2 3B — Smallest/Fastest",      active: false },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Dolphin 24B — Uncensored",     active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  { id: "stabilityai/stable-diffusion-xl-base-1.0",               name: "SDXL 1.0 — High Quality",           active: true  },
  { id: "black-forest-labs/FLUX.1-schnell",                        name: "FLUX Schnell — Fast & Sharp",       active: false },
  { id: "black-forest-labs/FLUX.1-dev",                            name: "FLUX Dev — Best Quality",           active: false },
  { id: "SG161222/RealVisXL_V4.0",                                 name: "RealVisXL v4 — Photorealistic",     active: false },
  { id: "Lykon/dreamshaper-8",                                     name: "DreamShaper 8 — Creative",          active: false },
  { id: "cagliostrolab/animagine-xl-4.0",                          name: "Animagine XL 4.0 — Anime",          active: false },
  { id: "playgroundai/playground-v2.5-1024px-aesthetic",           name: "Playground v2.5 — Aesthetic",       active: false },
  { id: "SG161222/Realistic_Vision_V5.1_noVAE",                    name: "Realistic Vision v5.1 — Portraits", active: false },
  { id: "CompVis/stable-diffusion-v1-4",                           name: "SD v1.4 — Classic Reliable",        active: false },
  { id: "stable-diffusion-v1-5/stable-diffusion-v1-5",             name: "SD v1.5 — Reliable Fallback",       active: false },
];

export async function getOrCreateBotConfig(): Promise<IBotConfig> {
  let config = await BotConfig.findOne();
  if (!config) {
    config = new BotConfig({
      activeChatModel:  DEFAULT_CHAT_MODELS.find(m => m.active)!.id,
      activeImageModel: DEFAULT_IMAGE_MODELS.find(m => m.active)!.id,
      chatModels:  DEFAULT_CHAT_MODELS,
      imageModels: DEFAULT_IMAGE_MODELS,
    });
    await config.save();
    return config;
  }
  return config;
}
