import mongoose, { Document, Schema } from "mongoose";

export interface IGroupSettings extends Document {
  chatId: number;
  title?: string;
  aiEnabled: boolean;
  style: "friendly" | "funny" | "serious" | "balanced";
  emoji: boolean;
  length: "long" | "short";
  welcomeMessage?: string;
  goodbyeMessage?: string;
  rules?: string;
  lockedTopics: string[];
  locked: boolean;
  antilink: boolean;
  antiflood: boolean;
  floodLimit: number;
  warnLimit: number;
  slowmode: number;
  captchaEnabled: boolean;
  autoDeleteServiceMessages: boolean;
  wordFilter: string[];
}

const GroupSettingsSchema = new Schema<IGroupSettings>(
  {
    chatId: { type: Number, required: true, unique: true, index: true },
    title: { type: String },
    aiEnabled: { type: Boolean, default: true },
    style: {
      type: String,
      enum: ["friendly", "funny", "serious", "balanced"],
      default: "friendly",
    },
    emoji: { type: Boolean, default: true },
    length: { type: String, enum: ["long", "short"], default: "short" },
    welcomeMessage: { type: String },
    goodbyeMessage: { type: String },
    rules: { type: String },
    lockedTopics: [{ type: String }],
    locked: { type: Boolean, default: false },
    antilink: { type: Boolean, default: false },
    antiflood: { type: Boolean, default: false },
    floodLimit: { type: Number, default: 5 },
    warnLimit: { type: Number, default: 3 },
    slowmode: { type: Number, default: 0 },
    captchaEnabled: { type: Boolean, default: false },
    autoDeleteServiceMessages: { type: Boolean, default: false },
    wordFilter: [{ type: String }],
  },
  { timestamps: true }
);

export const GroupSettings = mongoose.model<IGroupSettings>(
  "GroupSettings",
  GroupSettingsSchema
);
