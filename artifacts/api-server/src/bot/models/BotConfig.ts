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
  chatModels: IModelEntry[];
  imageModels: IModelEntry[];
  videoModels: IModelEntry[];
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
    activeImageModel: { type: String, default: "stabilityai/stable-diffusion-xl-base-1.0" },
    activeVideoModel: { type: String, default: "damo-vilab/text-to-video-ms-1.7b" },
    chatModels: { type: [ModelEntrySchema], default: [] },
    imageModels: { type: [ModelEntrySchema], default: [] },
    videoModels: { type: [ModelEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const BotConfig = mongoose.model<IBotConfig>("BotConfig", BotConfigSchema);

const DEFAULT_CHAT_MODELS: IModelEntry[] = [
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", active: true },
  { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B", active: false },
  { id: "google/gemma-2-9b-it:free", name: "Gemma 2 9B", active: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", active: false },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", active: false },
];

const DEFAULT_IMAGE_MODELS: IModelEntry[] = [
  { id: "stabilityai/stable-diffusion-xl-base-1.0", name: "SDXL 1.0", active: true },
  { id: "stabilityai/stable-diffusion-3-medium-diffusers", name: "SD 3 Medium", active: false },
  { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX Schnell", active: false },
  { id: "runwayml/stable-diffusion-v1-5", name: "SD v1.5", active: false },
];

const DEFAULT_VIDEO_MODELS: IModelEntry[] = [
  { id: "damo-vilab/text-to-video-ms-1.7b", name: "ModelScope T2V", active: true },
  { id: "ali-vilab/i2vgen-xl", name: "I2VGen-XL", active: false },
];

export async function getOrCreateBotConfig(): Promise<IBotConfig> {
  let config = await BotConfig.findOne();
  if (!config) {
    config = new BotConfig({
      activeChatModel: DEFAULT_CHAT_MODELS[0].id,
      activeImageModel: DEFAULT_IMAGE_MODELS[0].id,
      activeVideoModel: DEFAULT_VIDEO_MODELS[0].id,
      chatModels: DEFAULT_CHAT_MODELS,
      imageModels: DEFAULT_IMAGE_MODELS,
      videoModels: DEFAULT_VIDEO_MODELS,
    });
    await config.save();
  }
  return config;
}
