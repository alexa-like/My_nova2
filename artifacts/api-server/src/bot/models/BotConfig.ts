import mongoose, { Document, Schema } from "mongoose";

export interface IModelEntry {
  id: string;
  name: string;
  active: boolean;
}

export interface IUsageLimits {
  freeMessages: number;
  freeImages: number;
  freeBuilds: number;
  freeMusic: number;
  premiumMessages: number;
  premiumImages: number;
  premiumBuilds: number;
  premiumMusic: number;
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
    freeMusic:       { type: Number, default: 3 },
    premiumMessages: { type: Number, default: -1 },
    premiumImages:   { type: Number, default: -1 },
    premiumBuilds:   { type: Number, default: 20 },
    premiumMusic:    { type: Number, default: -1 },
    resetIntervalHours: { type: Number, default: 24 },
  },
  { _id: false }
);

const BotConfigSchema = new Schema<IBotConfig>(
  {
    activeChatModel:  { type: String, default: "meta-llama/llama-3.1-8b-instruct:free" },
    activeImageModel: { type: String, default: "black-forest-labs/FLUX.1-schnell" },
    chatModels:  { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
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
// Image: HuggingFace Inference API (inf:true or inf:"warm" verified).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  { id: "meta-llama/llama-3.1-8b-instruct:free",                    name: "Fast: Llama 3.1 8B — Ultra Fast",      active: true  },
  { id: "google/gemma-2-9b-it:free",                                 name: "Fast: Gemma 2 9B — Smart & Quick",     active: false },
  { id: "mistralai/mistral-7b-instruct:free",                        name: "Fast: Mistral 7B — Reliable",          active: false },
  { id: "meta-llama/llama-3.3-70b-instruct:free",                    name: "Quality: Llama 3.3 70B — Best",        active: false },
  { id: "deepseek/deepseek-r1-distill-llama-70b:free",               name: "Quality: DeepSeek R1 70B — Reasoning", active: false },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free",                 name: "Quality: Hermes 3 405B — Context",     active: false },
  { id: "qwen/qwen-2.5-72b-instruct:free",                           name: "Quality: Qwen 2.5 72B — Multilingual", active: false },
  { id: "deepseek/deepseek-v3-base:free",                            name: "Quality: DeepSeek V3 — Coder",         active: false },
  { id: "deepseek/deepseek-r1:free",                                  name: "Quality: DeepSeek R1 — Full Reason",   active: false },
  { id: "mistralai/mixtral-8x7b-instruct:free",                      name: "Quality: Mixtral 8x7B — Balanced",     active: false },
  { id: "google/gemma-2-27b-it:free",                                 name: "Quality: Gemma 2 27B — Google Large",  active: false },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Dolphin 24B — Uncensored",         active: false },
  { id: "meta-llama/llama-3.2-3b-instruct:free",                     name: "Fast: Llama 3.2 3B — Tiny/Fastest",   active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  { id: "black-forest-labs/FLUX.1-schnell",                        name: "FLUX.1 Schnell — Fast & Sharp",     active: true  },
  { id: "stabilityai/stable-diffusion-xl-base-1.0",               name: "SDXL 1.0 — High Quality",           active: false },
  { id: "SG161222/RealVisXL_V4.0",                                 name: "RealVisXL v4 — Photorealistic",     active: false },
  { id: "Lykon/dreamshaper-8",                                     name: "DreamShaper 8 — Creative",          active: false },
  { id: "cagliostrolab/animagine-xl-4.0",                          name: "Animagine XL 4.0 — Anime",          active: false },
  { id: "playgroundai/playground-v2.5-1024px-aesthetic",           name: "Playground v2.5 — Aesthetic",       active: false },
  { id: "SG161222/Realistic_Vision_V5.1_noVAE",                    name: "Realistic Vision v5.1 — Portraits", active: false },
  { id: "CompVis/stable-diffusion-v1-4",                           name: "SD v1.4 — Classic Reliable",        active: false },
  { id: "stable-diffusion-v1-5/stable-diffusion-v1-5",             name: "SD v1.5 — Reliable Fallback",       active: false },
  { id: "stabilityai/stable-diffusion-3-medium-diffusers",         name: "SD 3 Medium — Modern Quality",      active: false },
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
