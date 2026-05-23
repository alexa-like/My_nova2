import { User } from "../models/User.js";
import { logger } from "../../lib/logger.js";

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  secret?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_message",    icon: "💬", title: "First Words",        description: "Sent your first message to Nova" },
  { id: "first_image",      icon: "🎨", title: "Artist",             description: "Generated your first image" },
  { id: "first_build",      icon: "🔨", title: "Builder",            description: "Built your first website or app" },
  { id: "first_search",     icon: "🔍", title: "Explorer",           description: "Ran your first web search" },
  { id: "first_voice",      icon: "🔊", title: "Voice Activated",    description: "Used text-to-speech for the first time" },
  { id: "first_sticker",    icon: "🖼️", title: "Sticker Master",     description: "Created your first sticker" },
  { id: "streak_3",         icon: "🔥", title: "On Fire",            description: "Maintained a 3-day streak" },
  { id: "streak_7",         icon: "⚡", title: "Week Warrior",       description: "Maintained a 7-day streak" },
  { id: "streak_30",        icon: "🏆", title: "Legendary",          description: "Maintained a 30-day streak" },
  { id: "messages_10",      icon: "📨", title: "Getting Started",    description: "Sent 10 messages" },
  { id: "messages_100",     icon: "💯", title: "Century Club",       description: "Sent 100 messages" },
  { id: "messages_500",     icon: "🌟", title: "Power User",         description: "Sent 500 messages" },
  { id: "images_10",        icon: "🖼️", title: "Prolific Creator",   description: "Generated 10 images" },
  { id: "builds_5",         icon: "🚀", title: "Serial Builder",     description: "Built 5 projects" },
  { id: "premium",          icon: "💎", title: "VIP Member",         description: "Activated Premium status" },
  { id: "referral",         icon: "👥", title: "Ambassador",         description: "Referred a friend to Nova" },
  { id: "daily_7",          icon: "📅", title: "Consistent",         description: "Claimed daily reward 7 times" },
  { id: "night_owl",        icon: "🦉", title: "Night Owl",          description: "Used Nova after midnight", secret: true },
  { id: "early_bird",       icon: "🐦", title: "Early Bird",         description: "Used Nova before 6am", secret: true },
  { id: "polyglot",         icon: "🌍", title: "Polyglot",           description: "Changed language settings" },
];

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

export async function checkAndAwardAchievements(
  userId: number,
  trigger: {
    type: "message" | "image" | "build" | "search" | "voice" | "sticker" | "streak" | "daily" | "premium" | "referral" | "language";
    count?: number;
  }
): Promise<Achievement[]> {
  try {
    const user = await User.findOne({ userId });
    if (!user) return [];

    const earned = (user as any).achievements as string[] ?? [];
    const newlyEarned: Achievement[] = [];

    const award = (id: string) => {
      const ach = getAchievementById(id);
      if (ach && !earned.includes(id)) {
        earned.push(id);
        newlyEarned.push(ach);
      }
    };

    const hour = new Date().getHours();

    switch (trigger.type) {
      case "message": {
        const count = trigger.count ?? user.usage.messages;
        award("first_message");
        if (count >= 10)  award("messages_10");
        if (count >= 100) award("messages_100");
        if (count >= 500) award("messages_500");
        if (hour >= 0 && hour < 4)   award("night_owl");
        if (hour >= 4 && hour < 6)   award("early_bird");
        break;
      }
      case "image": {
        award("first_image");
        if ((trigger.count ?? 0) >= 10) award("images_10");
        break;
      }
      case "build": {
        award("first_build");
        if ((trigger.count ?? 0) >= 5) award("builds_5");
        break;
      }
      case "search":   award("first_search");  break;
      case "voice":    award("first_voice");   break;
      case "sticker":  award("first_sticker"); break;
      case "streak": {
        const s = trigger.count ?? user.streak;
        if (s >= 3)  award("streak_3");
        if (s >= 7)  award("streak_7");
        if (s >= 30) award("streak_30");
        break;
      }
      case "daily":    award("daily_7"); break;
      case "premium":  award("premium"); break;
      case "referral": award("referral"); break;
      case "language": award("polyglot"); break;
    }

    if (newlyEarned.length > 0) {
      await User.updateOne({ userId }, { $set: { achievements: earned } });
    }

    return newlyEarned;
  } catch (err) {
    logger.warn({ err }, "Achievement check failed (non-fatal)");
    return [];
  }
}

export function formatAchievementNotification(achievements: Achievement[]): string {
  if (achievements.length === 0) return "";
  if (achievements.length === 1) {
    const a = achievements[0];
    return `\n\n🏅 Achievement Unlocked!\n${a.icon} ${a.title} — ${a.description}`;
  }
  const list = achievements.map(a => `${a.icon} ${a.title}`).join("\n");
  return `\n\n🏅 ${achievements.length} Achievements Unlocked!\n${list}`;
}

export async function getUserAchievements(userId: number): Promise<Achievement[]> {
  try {
    const user = await User.findOne({ userId });
    const earned = (user as any)?.achievements as string[] ?? [];
    return earned.map(id => getAchievementById(id)).filter(Boolean) as Achievement[];
  } catch {
    return [];
  }
}

export async function recordLastFeature(userId: number, feature: string): Promise<void> {
  try {
    const user = await User.findOne({ userId });
    if (!user) return;
    const lastFeatures: string[] = (user as any).lastFeatures ?? [];
    const filtered = lastFeatures.filter((f: string) => f !== feature);
    const updated = [feature, ...filtered].slice(0, 3);
    await User.updateOne({ userId }, { $set: { lastFeatures: updated } });
  } catch {
  }
}

export async function getLastFeatures(userId: number): Promise<string[]> {
  try {
    const user = await User.findOne({ userId });
    return (user as any)?.lastFeatures ?? [];
  } catch {
    return [];
  }
}

export const FEATURE_LABELS: Record<string, { icon: string; label: string; callback: string }> = {
  chat:         { icon: "💬", label: "Chat",           callback: "ai_ask" },
  image:        { icon: "🎨", label: "Generate Image", callback: "img_generate" },
  sticker:      { icon: "🖼️", label: "Sticker",        callback: "sticker_btn" },
  search:       { icon: "🔍", label: "Web Search",     callback: "search_btn" },
  voice:        { icon: "🔊", label: "Text-to-Speech", callback: "tts_btn" },
  build:        { icon: "🌐", label: "Build",          callback: "build_menu" },
  summarize:    { icon: "📝", label: "Summarize",      callback: "ai_summarize" },
  translate:    { icon: "🌍", label: "Translate",      callback: "ai_translate" },
  joke:         { icon: "😂", label: "Joke",           callback: "fun_joke" },
  trivia:       { icon: "🎯", label: "Trivia",         callback: "fun_game" },
  reminder:     { icon: "⏰", label: "Reminder",       callback: "remind_btn" },
};
