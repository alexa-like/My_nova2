export interface Announcement {
  id: string;
  date: string;
  title: string;
  emoji: string;
  body: string;
  isNew?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "engage_system",
    date: "2025-05-23",
    emoji: "🏅",
    title: "Achievements & Streaks",
    body: "Nova now tracks your milestones! Earn badges for your first image, building projects, maintaining streaks, and more. Use /achievements to see yours.",
    isNew: true,
  },
  {
    id: "smart_suggestions",
    date: "2025-05-23",
    emoji: "💡",
    title: "Smart Suggestions",
    body: "After every action, Nova now suggests what to do next — context-aware and relevant. No more guessing what's possible!",
    isNew: true,
  },
  {
    id: "onboarding_v2",
    date: "2025-05-23",
    emoji: "👋",
    title: "New Welcome Experience",
    body: "New users now get an interactive onboarding tour. Returning users see a personalised 'Welcome Back' with quick access to recent features.",
    isNew: true,
  },
  {
    id: "privacy_section",
    date: "2025-05-23",
    emoji: "🔒",
    title: "Privacy & Transparency",
    body: "You can now review exactly what data Nova stores and why. Use /privacy or find it in ⚙️ Settings → Privacy.",
    isNew: true,
  },
  {
    id: "build_deploy",
    date: "2025-05-01",
    emoji: "🚀",
    title: "Build & Deploy in One Step",
    body: "Use /deploy <idea> to build a complete website AND deploy it live to Vercel in a single command.",
  },
  {
    id: "modes",
    date: "2025-04-15",
    emoji: "🎯",
    title: "Mode Switching",
    body: "Switch Nova into focused modes — Image Mode, Search Mode, Build Mode, Voice Mode, and more. Use /mode to explore.",
  },
  {
    id: "credits",
    date: "2025-04-01",
    emoji: "💰",
    title: "Credits System",
    body: "Earn credits daily and use them for AI features. Claim your free daily reward every 24 hours and refer friends for bonus credits.",
  },
];

export function formatAnnouncements(): string {
  const newItems = ANNOUNCEMENTS.filter(a => a.isNew);
  const recentItems = ANNOUNCEMENTS.filter(a => !a.isNew).slice(0, 3);

  let text = "📢 What's New in Nova\n\n";

  if (newItems.length > 0) {
    text += "🆕 Latest Updates:\n";
    for (const a of newItems) {
      text += `\n${a.emoji} ${a.title}\n${a.body}\n`;
    }
  }

  if (recentItems.length > 0) {
    text += "\n── Previous Updates ──\n";
    for (const a of recentItems) {
      text += `\n${a.emoji} ${a.title} (${a.date})\n${a.body}\n`;
    }
  }

  text += "\nStay tuned — Nova improves every week!";
  return text;
}

export function getNewCount(): number {
  return ANNOUNCEMENTS.filter(a => a.isNew).length;
}
