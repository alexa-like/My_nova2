import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  firstSeen: Date;
  lastSeen: Date;
  settings: {
    style: "friendly" | "funny" | "serious" | "balanced";
    emoji: boolean;
    length: "long" | "short";
    language: string;
    voiceEnabled: boolean;
    voiceName: string;
  };
  preferredChatModel?: string;
  mood?: string;
  interests: string[];
  notes: string[];
  groups: number[];
  premium: {
    active: boolean;
    expiresAt?: Date;
    plan?: string;
  };
  usage: {
    messages: number;
    images: number;
    lastReset: Date;
  };
  warnings: number;
  banned: boolean;
  isOwner: boolean;
  feedbackCount: number;
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    settings: {
      style: {
        type: String,
        enum: ["friendly", "funny", "serious", "balanced"],
        default: "friendly",
      },
      emoji: { type: Boolean, default: true },
      length: { type: String, enum: ["long", "short"], default: "long" },
      language: { type: String, default: "en" },
      voiceEnabled: { type: Boolean, default: false },
      voiceName: { type: String, default: "facebook/mms-tts-eng" },
    },
    preferredChatModel: { type: String },
    mood: { type: String },
    interests: [{ type: String }],
    notes: [{ type: String }],
    groups: [{ type: Number }],
    premium: {
      active: { type: Boolean, default: false },
      expiresAt: { type: Date },
      plan: { type: String },
    },
    usage: {
      messages: { type: Number, default: 0 },
      images: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now },
    },
    warnings: { type: Number, default: 0 },
    banned: { type: Boolean, default: false },
    isOwner: { type: Boolean, default: false },
    feedbackCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", UserSchema);
