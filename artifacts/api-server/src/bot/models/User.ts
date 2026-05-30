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
    language: string;
  };
  dailyGift?: {
    label: string;
    type: "images" | "credits";
    amount: number;
    remaining: number;
    command: string;
    expiresAt: Date;
    warned: boolean;
    expired: boolean;
    giftDate: string;
  };
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
    edits: number;
    builds: number;
    lastReset: Date;
  };
  github: {
    tokenEncrypted?: string;
    username?: string;
  };
  vercelTokenEncrypted?: string;
  renderTokenEncrypted?: string;
  projects: Array<{
    name: string;
    repoUrl: string;
    deployUrl?: string;
    createdAt: Date;
  }>;
  warnings: number;
  banned: boolean;
  isOwner: boolean;
  feedbackCount: number;
  streak: number;
  lastDailyReward?: Date;
  dailyRewardCount: number;
  bonusImages: number;
  referralCode?: string;
  referredBy?: number;
  referrals: number[];
  activeMode?: string;
  credits: number;
  referralRewardClaimed: boolean;
  recentFeatures: string[];
  lastFeatures: string[];
  achievements: string[];
  onboardingComplete: boolean;
  onboarded: boolean;
  loginStreak: number;
  lastActiveDate?: Date;
  totalMessages: number;
  totalImages: number;
  totalBuilds: number;
  totalSearches: number;
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
      language: { type: String, default: "en" },
    },
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
      images:   { type: Number, default: 0 },
      edits:    { type: Number, default: 0 },
      builds:   { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now },
    },
    github: {
      tokenEncrypted: { type: String, select: false },
      username: { type: String },
    },
    vercelTokenEncrypted: { type: String, select: false },
    renderTokenEncrypted: { type: String, select: false },
    projects: [
      {
        name: { type: String },
        repoUrl: { type: String },
        deployUrl: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    warnings:      { type: Number, default: 0 },
    banned:        { type: Boolean, default: false },
    isOwner:       { type: Boolean, default: false },
    feedbackCount: { type: Number, default: 0 },
    streak:        { type: Number, default: 0 },
    lastDailyReward: { type: Date },
    dailyRewardCount: { type: Number, default: 0 },
    bonusImages:   { type: Number, default: 0 },
    referralCode:  { type: String },
    referredBy:    { type: Number },
    referrals:     [{ type: Number }],
    activeMode:    { type: String, default: "nova" },
    credits:       { type: Number, default: 50 },
    referralRewardClaimed: { type: Boolean, default: false },
    recentFeatures:    { type: [String], default: [] },
    lastFeatures:      { type: [String], default: [] },
    achievements:      { type: [String], default: [] },
    onboardingComplete:{ type: Boolean, default: false },
    onboarded:         { type: Boolean, default: false },
    loginStreak:       { type: Number, default: 0 },
    lastActiveDate:    { type: Date },
    totalMessages:     { type: Number, default: 0 },
    totalImages:       { type: Number, default: 0 },
    totalBuilds:       { type: Number, default: 0 },
    totalSearches:     { type: Number, default: 0 },
    dailyGift: {
      label:     { type: String },
      type:      { type: String, enum: ["images", "credits"] },
      amount:    { type: Number },
      remaining: { type: Number },
      command:   { type: String },
      expiresAt: { type: Date },
      warned:    { type: Boolean, default: false },
      expired:   { type: Boolean, default: false },
      giftDate:  { type: String },
    },
  },
  { timestamps: true }
);

// Performance indexes for common query patterns
UserSchema.index({ lastSeen: -1 });                  // sort by recent activity
UserSchema.index({ banned: 1 });                     // filter banned users
UserSchema.index({ "premium.active": 1 });           // filter premium users
UserSchema.index({ referralCode: 1 }, { sparse: true }); // referral code lookups
UserSchema.index({ "premium.active": 1, banned: 1 }); // broadcast filters

export const User = mongoose.model<IUser>("User", UserSchema);
