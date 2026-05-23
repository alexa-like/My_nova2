import { User } from "../models/User.js";
import { logger } from "../../lib/logger.js";

// ── Achievement definitions ───────────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}

export const ACHIEVEMENTS: Record<string, Achievement> = {
  first_chat:     { id: "first_chat",     emoji: "💬", name: "First Words",       desc: "Sent your first message to Nova" },
  first_image:    { id: "first_image",    emoji: "🎨", name: "Image Creator",      desc: "Generated your first image" },
  first_build:    { id: "first_build",    emoji: "🔨", name: "Builder",            desc: "Built your first project" },
  first_voice:    { id: "first_voice",    emoji: "🎤", name: "Voice User",         desc: "Used voice or TTS features" },
  first_search:   { id: "first_search",   emoji: "🔍", name: "Explorer",           desc: "Searched the web with Nova" },
  first_sticker:  { id: "first_sticker",  emoji: "🖼️", name: "Sticker Artist",    desc: "Created your first sticker" },
  streak_3:       { id: "streak_3",       emoji: "🔥", name: "On Fire",            desc: "Active 3 days in a row" },
  streak_7:       { id: "streak_7",       emoji: "⚡", name: "Dedicated",          desc: "Active 7 days in a row" },
  streak_30:      { id: "streak_30",      emoji: "👑", name: "Legendary",          desc: "Active 30 days in a row" },
  messages_50:    { id: "messages_50",    emoji: "📢", name: "Chatterbox",         desc: "Sent 50 messages" },
  messages_100:   { id: "messages_100",   emoji: "🚀", name: "Power User",         desc: "Sent 100 messages" },
  feature_explorer: { id: "feature_explorer", emoji: "🗺️", name: "Feature Explorer", desc: "Used 5 different features" },
  referrer:       { id: "referrer",       emoji: "👥", name: "Ambassador",         desc: "Referred your first friend" },
};

// ── Feature key → achievement mapping ────────────────────────────────────────

const FIRST_USE_ACHIEVEMENTS: Record<string, string> = {
  chat:      "first_chat",
  image:     "first_image",
  build:     "first_build",
  tts:       "first_voice",
  stt:       "first_voice",
  search:    "first_search",
  sticker:   "first_sticker",
};

// ── Feature display labels (for recent features display) ──────────────────────

export const FEATURE_LABELS: Record<string, { label: string; emoji: string; cb: string }> = {
  chat:      { label: "Chat",         emoji: "💬", cb: "ai_ask" },
  image:     { label: "Image",        emoji: "🎨", cb: "img_generate" },
  build:     { label: "Build",        emoji: "🔨", cb: "build_menu" },
  tts:       { label: "Voice",        emoji: "🔊", cb: "tts_btn" },
  stt:       { label: "Transcribe",   emoji: "🎤", cb: "stt_btn" },
  search:    { label: "Search",       emoji: "🔍", cb: "search_btn" },
  translate: { label: "Translate",    emoji: "🌍", cb: "ai_translate" },
  summarize: { label: "Summarize",    emoji: "📝", cb: "ai_summarize" },
  sticker:   { label: "Sticker",      emoji: "🖼️", cb: "sticker_btn" },
  describe:  { label: "Describe",     emoji: "🔬", cb: "ai_menu" },
};

// ── Update recent features ────────────────────────────────────────────────────

export async function updateRecentFeatures(userId: number, featureKey: string): Promise<void> {
  try {
    const user = await User.findOne({ userId });
    if (!user) return;
    const recent = Array.isArray(user.recentFeatures) ? [...user.recentFeatures] : [];
    // Remove duplicates, prepend latest, keep last 5
    const updated = [featureKey, ...recent.filter(f => f !== featureKey)].slice(0, 5);
    await User.updateOne({ userId }, { $set: { recentFeatures: updated } });
  } catch (err) {
    logger.warn({ err }, "Failed to update recent features (non-fatal)");
  }
}

// ── Update login streak ───────────────────────────────────────────────────────

export async function updateLoginStreak(userId: number): Promise<number> {
  try {
    const user = await User.findOne({ userId });
    if (!user) return 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastActive = user.lastActiveDate
      ? new Date(
          (user.lastActiveDate as Date).getFullYear(),
          (user.lastActiveDate as Date).getMonth(),
          (user.lastActiveDate as Date).getDate()
        )
      : null;

    let newStreak = user.loginStreak ?? 0;

    if (!lastActive) {
      // First activity
      newStreak = 1;
    } else {
      const diffDays = Math.round((today.getTime() - lastActive.getTime()) / 86400000);
      if (diffDays === 0) {
        // Same day — no change
        return newStreak;
      } else if (diffDays === 1) {
        // Consecutive day
        newStreak += 1;
      } else {
        // Streak broken
        newStreak = 1;
      }
    }

    await User.updateOne({ userId }, { $set: { loginStreak: newStreak, lastActiveDate: now } });
    return newStreak;
  } catch (err) {
    logger.warn({ err }, "Failed to update login streak (non-fatal)");
    return 0;
  }
}

// ── Check and grant achievements ──────────────────────────────────────────────
// Returns newly unlocked achievement objects so the caller can show a toast.

export async function checkAndGrantAchievements(
  userId: number,
  featureKey?: string
): Promise<Achievement[]> {
  try {
    const user = await User.findOne({ userId });
    if (!user) return [];

    const existing = new Set(Array.isArray(user.achievements) ? user.achievements : []);
    const newlyUnlocked: Achievement[] = [];

    function tryUnlock(id: string): void {
      if (!existing.has(id) && ACHIEVEMENTS[id]) {
        existing.add(id);
        newlyUnlocked.push(ACHIEVEMENTS[id]);
      }
    }

    // First-use achievements
    if (featureKey && FIRST_USE_ACHIEVEMENTS[featureKey]) {
      tryUnlock(FIRST_USE_ACHIEVEMENTS[featureKey]);
    }

    // Message milestones
    const totalMsgs = (user.usage?.messages ?? 0);
    if (totalMsgs >= 50)  tryUnlock("messages_50");
    if (totalMsgs >= 100) tryUnlock("messages_100");

    // Streak achievements
    const streak = user.loginStreak ?? 0;
    if (streak >= 3)  tryUnlock("streak_3");
    if (streak >= 7)  tryUnlock("streak_7");
    if (streak >= 30) tryUnlock("streak_30");

    // Feature explorer — used 5 different features
    const recent = user.recentFeatures ?? [];
    if (new Set(recent).size >= 5) tryUnlock("feature_explorer");

    // Referrer achievement
    if ((user.referrals?.length ?? 0) >= 1) tryUnlock("referrer");

    if (newlyUnlocked.length > 0) {
      await User.updateOne({ userId }, { $set: { achievements: [...existing] } });
    }

    return newlyUnlocked;
  } catch (err) {
    logger.warn({ err }, "Failed to check achievements (non-fatal)");
    return [];
  }
}

// ── Format achievements for display ──────────────────────────────────────────

export function formatAchievementsText(achievementIds: string[]): string {
  if (!achievementIds || achievementIds.length === 0) {
    return "No achievements yet — start using Nova to earn badges! 🌟";
  }
  const lines = achievementIds
    .map(id => ACHIEVEMENTS[id])
    .filter(Boolean)
    .map(a => `${a.emoji} *${a.name}* — ${a.desc}`);
  return `🏆 *Your Achievements* (${achievementIds.length}/${Object.keys(ACHIEVEMENTS).length})\n\n${lines.join("\n")}`;
}

// ── Format new achievement toast ──────────────────────────────────────────────

export function formatAchievementToast(achievements: Achievement[]): string {
  if (achievements.length === 0) return "";
  const lines = achievements.map(a => `${a.emoji} *${a.name}* — ${a.desc}`).join("\n");
  return `🏆 Achievement Unlocked!\n\n${lines}`;
}
