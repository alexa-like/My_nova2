export interface Announcement {
  id: string;
  date: string;
  title: string;
  emoji: string;
  body: string;
}

const NEW_WINDOW_DAYS = 14;

function isNew(dateStr: string): boolean {
  const announcedAt = new Date(dateStr).getTime();
  return Date.now() - announcedAt < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "stars_payment",
    date: "2026-05-24",
    emoji: "⭐",
    title: "Buy Credits & VIP with Telegram Stars",
    body: "You can now buy credits and VIP membership directly with Telegram Stars — no card needed. Tap 💰 Credits from the menu to get started.",
  },
  {
    id: "webhook_mode",
    date: "2026-05-24",
    emoji: "⚡",
    title: "Faster Responses",
    body: "Nova now uses Telegram webhooks for near-instant message delivery. No more polling delay!",
  },
  {
    id: "engage_system",
    date: "2026-05-01",
    emoji: "🏅",
    title: "Achievements & Streaks",
    body: "Nova tracks your milestones! Earn badges for your first image, building projects, maintaining streaks, and more. Use /achievements to see yours.",
  },
  {
    id: "build_deploy",
    date: "2026-04-15",
    emoji: "🚀",
    title: "Build & Deploy",
    body: "Use /build <idea> to generate a full website or app. After building, tap ⚡ Deploy to go live on Vercel in seconds.",
  },
  {
    id: "modes",
    date: "2026-04-01",
    emoji: "🎯",
    title: "Mode Switching",
    body: "Switch Nova into focused modes — Image Mode, Search Mode, Build Mode, Voice Mode, and more. Use /mode to explore.",
  },
  {
    id: "credits",
    date: "2026-03-15",
    emoji: "💰",
    title: "Credits System",
    body: "Earn credits daily and use them for AI features. Claim your free daily reward every 24 hours and refer friends for bonus credits.",
  },
];

export function formatAnnouncements(): string {
  const newItems = ANNOUNCEMENTS.filter(a => isNew(a.date));
  const oldItems = ANNOUNCEMENTS.filter(a => !isNew(a.date)).slice(0, 3);

  let text = "📢 What's New in Nova\n\n";

  if (newItems.length > 0) {
    text += "🆕 Latest Updates:\n";
    for (const a of newItems) {
      text += `\n${a.emoji} ${a.title}\n${a.body}\n`;
    }
  }

  if (oldItems.length > 0) {
    text += "\n── Previous Updates ──\n";
    for (const a of oldItems) {
      text += `\n${a.emoji} ${a.title} (${a.date})\n${a.body}\n`;
    }
  }

  text += "\nStay tuned — Nova improves every week!";
  return text;
}

export function getNewCount(): number {
  return ANNOUNCEMENTS.filter(a => isNew(a.date)).length;
}
