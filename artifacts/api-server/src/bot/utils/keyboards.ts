import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";
import { IModelEntry } from "../models/BotConfig.js";

// ── Persistent Reply Keyboard (main navigation — private chats only) ──────────

export function mainMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "💬 Chat" }, { text: "🎨 Create" }, { text: "🌐 Build" }],
      [{ text: "🔍 Search" }, { text: "😄 Fun" }, { text: "🎮 Games" }],
      [{ text: "📊 Profile" }, { text: "💰 Balance" }, { text: "🪙 Earn" }],
      [{ text: "👥 Refer" }, { text: "🎁 Daily" }, { text: "⏰ Reminders" }],
      [{ text: "⭐ Premium" }, { text: "⚙️ Settings" }, { text: "❓ Help" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// ── Main dashboard (inline — used inside callback edits) ──────────────────────

export function mainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Chat", callback_data: "ai_menu" },
        { text: "🎨 Create", callback_data: "img_menu" },
      ],
      [
        { text: "🌐 Build", callback_data: "build_menu" },
        { text: "🔍 Search", callback_data: "search_btn" },
      ],
      [
        { text: "😄 Fun", callback_data: "fun_menu" },
        { text: "🎮 Games", callback_data: "games_menu" },
      ],
      [
        { text: "⏰ Reminders", callback_data: "reminders_btn" },
        { text: "🎁 Daily Reward", callback_data: "daily_reward" },
      ],
      [
        { text: "📊 My Account", callback_data: "account_menu" },
        { text: "💰 Credits", callback_data: "credits_menu" },
        { text: "🪙 Earn Coins", callback_data: "earn_coins" },
      ],
      [
        { text: "⭐ Go Premium", callback_data: "settings_premium" },
        { text: "⚙️ Settings", callback_data: "settings_menu" },
      ],
    ],
  };
}

export function accountMenuKeyboard(isPremium: boolean): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💰 Credits & Packs", callback_data: "credits_menu" },
        { text: "🎁 Daily Reward", callback_data: "daily_reward" },
      ],
      [
        { text: "👥 Referral Link", callback_data: "referral_menu" },
        ...(isPremium ? [] : [{ text: "⭐ Upgrade to VIP", callback_data: "settings_premium" }]),
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

export function creditsMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  rows.push([
    { text: "🌱 50 Credits — 15 ⭐", callback_data: "buy_pack_pack_50" },
    { text: "⚡ 150 Credits — 40 ⭐", callback_data: "buy_pack_pack_150" },
  ]);
  rows.push([
    { text: "🚀 500 Credits — 115 ⭐", callback_data: "buy_pack_pack_500" },
    { text: "💎 1500 Credits — 299 ⭐", callback_data: "buy_pack_pack_1500" },
  ]);
  rows.push([
    { text: "⭐ VIP Monthly — 149 ⭐", callback_data: "buy_pack_vip_monthly" },
    { text: "👑 VIP Lifetime — 499 ⭐", callback_data: "buy_pack_vip_lifetime" },
  ]);
  rows.push([
    { text: "🎁 Claim Daily Reward", callback_data: "daily_reward" },
    { text: "👥 Earn via Referrals", callback_data: "referral_menu" },
  ]);
  rows.push([{ text: "⬅️ Menu", callback_data: "main_menu" }]);
  return { inline_keyboard: rows };
}

export function referralKeyboard(botUsername: string, referralCode: string): TelegramBot.InlineKeyboardMarkup {
  const link = `https://t.me/${botUsername}?start=ref_${referralCode}`;
  return {
    inline_keyboard: [
      [{ text: "🔗 Share Referral Link", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on Nova AI! Use my link to get bonus credits 🎁")}` }],
      [{ text: "⬅️ Back", callback_data: "account_menu" }],
    ],
  };
}

export function insufficientCreditsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎁 Claim Daily Reward", callback_data: "daily_reward" },
        { text: "💰 Buy Credits", callback_data: "credits_menu" },
      ],
      [{ text: "⭐ Go VIP — Unlimited", callback_data: "settings_premium" }],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Build result keyboard ─────────────────────────────────────────────────────

export function buildResultKeyboard(
  repoUrl?: string
): TelegramBot.InlineKeyboardMarkup {
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  if (repoUrl) {
    buttons.push([{ text: "🔗 Open on GitHub", url: repoUrl }]);
  }
  buttons.push([
    { text: "⚡ Deploy to Vercel", callback_data: "deploy_live" },
    { text: "🟣 Deploy to Render", callback_data: "deploy_render" },
  ]);
  buttons.push([
    { text: "📁 My Projects", callback_data: "my_projects" },
    { text: "🌐 Build Another", callback_data: "build_menu" },
  ]);
  buttons.push([{ text: "⬅️ Menu", callback_data: "main_menu" }]);
  return { inline_keyboard: buttons };
}

// ── Navigation shortcuts ──────────────────────────────────────────────────────

export function backToMainKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] };
}

export function backToSettingsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }]] };
}

export function backToFunKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "fun_menu" }]] };
}

export function backToAiKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "ai_menu" }]] };
}

export function backToImgKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "img_menu" }]] };
}

// ── Fun menu ──────────────────────────────────────────────────────────────────

export function funMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "😂 Joke", callback_data: "fun_joke" },
        { text: "🎱 Magic 8-Ball", callback_data: "fun_8ball" },
      ],
      [
        { text: "💘 Ship Us", callback_data: "fun_ship" },
        { text: "🔥 Roast Me", callback_data: "fun_roast" },
      ],
      [
        { text: "🧠 IQ Test", callback_data: "fun_iq" },
        { text: "🌟 Compliment Me", callback_data: "fun_compliment" },
      ],
      [
        { text: "🔮 Fortune", callback_data: "fun_fortune" },
        { text: "😈 Daily Dare", callback_data: "fun_dare" },
      ],
      [
        { text: "✨ Vibe Check", callback_data: "fun_vibe" },
        { text: "💭 Truth Question", callback_data: "fun_truth" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Games menu ────────────────────────────────────────────────────────────────

export function gamesMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎯 Trivia Quiz", callback_data: "fun_game" },
        { text: "🤔 Would You Rather", callback_data: "fun_wyr" },
      ],
      [
        { text: "📖 Word of the Day", callback_data: "fun_word" },
        { text: "🎲 Random Fact", callback_data: "fun_fact_game" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Write for Me menu ─────────────────────────────────────────────────────────

export function writeMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🐦 Tweet", callback_data: "write_tweet" },
        { text: "📸 IG Caption", callback_data: "write_caption" },
      ],
      [
        { text: "👤 Bio", callback_data: "write_bio" },
        { text: "🎵 Song Lyrics", callback_data: "write_lyrics" },
      ],
      [
        { text: "📧 Email", callback_data: "write_email" },
        { text: "🎭 Poem", callback_data: "write_poem" },
      ],
      [{ text: "⬅️ Back", callback_data: "ai_menu" }],
    ],
  };
}

// ── AI tools menu ─────────────────────────────────────────────────────────────

export function aiMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Ask Nova", callback_data: "ai_ask" },
        { text: "📝 Summarize", callback_data: "ai_summarize" },
      ],
      [
        { text: "🌍 Translate", callback_data: "ai_translate" },
        { text: "✍️ Write for Me", callback_data: "ai_write" },
      ],
      [
        { text: "🗣️ Debate Me", callback_data: "ai_debate" },
        { text: "🔬 Analyze Text", callback_data: "ai_analyze" },
      ],
      [
        { text: "📜 History", callback_data: "history_btn" },
        { text: "🧹 Clear Memory", callback_data: "forget_memory" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Image tools menu ──────────────────────────────────────────────────────────

export function imageMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✨ Generate Image", callback_data: "img_generate" },
        { text: "🎨 Style Presets", callback_data: "img_styles" },
      ],
      [
        { text: "🖼️ Create Sticker", callback_data: "sticker_btn" },
        { text: "✏️ Edit via Prompt", callback_data: "img_edit" },
      ],
      [
        { text: "🔆 Enhance Photo", callback_data: "img_enhance" },
        { text: "🎭 Stylize", callback_data: "img_stylize" },
      ],
      [{ text: "⬅️ Back to Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Image style presets keyboard ──────────────────────────────────────────────

export function imgStyleKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎌 Anime", callback_data: "img_style_anime" },
        { text: "🤖 Cyberpunk", callback_data: "img_style_cyberpunk" },
      ],
      [
        { text: "🌌 Fantasy", callback_data: "img_style_fantasy" },
        { text: "📸 Realistic", callback_data: "img_style_realistic" },
      ],
      [
        { text: "🎨 Oil Painting", callback_data: "img_style_oil" },
        { text: "💧 Watercolor", callback_data: "img_style_watercolor" },
      ],
      [
        { text: "✏️ Sketch", callback_data: "img_style_sketch" },
        { text: "👾 Pixel Art", callback_data: "img_style_pixel" },
      ],
      [{ text: "⬅️ Back", callback_data: "img_menu" }],
    ],
  };
}

// ── Mood picker keyboard ──────────────────────────────────────────────────────

export function moodPickerKeyboard(current?: string): TelegramBot.InlineKeyboardMarkup {
  const moods: [string, string, string][] = [
    ["😊 Happy", "happy", "mood_set_happy"],
    ["😔 Sad", "sad", "mood_set_sad"],
    ["😤 Stressed", "stressed", "mood_set_stressed"],
    ["😴 Bored", "bored", "mood_set_bored"],
    ["🤩 Excited", "excited", "mood_set_excited"],
    ["🎯 Focused", "focused", "mood_set_focused"],
    ["😍 Romantic", "romantic", "mood_set_romantic"],
    ["😠 Angry", "angry", "mood_set_angry"],
  ];

  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < moods.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, moods.length); j++) {
      const [label, val, cb] = moods[j];
      row.push({ text: (val === current ? "✅ " : "") + label, callback_data: cb });
    }
    rows.push(row);
  }
  rows.push([
    { text: "🗑️ Clear Mood", callback_data: "mood_clear" },
    { text: "⬅️ Back", callback_data: "settings_menu" },
  ]);

  return { inline_keyboard: rows };
}

// ── Settings menu ─────────────────────────────────────────────────────────────

export function settingsMenuKeyboard(user: IUser): TelegramBot.InlineKeyboardMarkup {
  const moodLabel = user.mood ? `😶 Mood: ${user.mood}` : "😶 Set Mood";
  const githubLabel = user.github?.username ? `✅ GitHub` : "🔑 GitHub";
  const emojiLabel = user.settings.emoji ? "😊 Emojis: ON" : "😑 Emojis: OFF";
  const emojiCb = user.settings.emoji ? "settings_emoji_off" : "settings_emoji_on";
  return {
    inline_keyboard: [
      [
        { text: "👤 My Profile", callback_data: "settings_profile" },
        { text: "📊 My Stats", callback_data: "show_stats" },
      ],
      [
        { text: "🎭 AI Style", callback_data: "settings_style" },
        { text: "📏 Reply Length", callback_data: "settings_length" },
      ],
      [
        { text: "🌐 Language", callback_data: "settings_lang" },
        { text: moodLabel, callback_data: "settings_mood" },
      ],
      [
        { text: emojiLabel, callback_data: emojiCb },
        { text: "🤖 AI Model", callback_data: "model_panel" },
      ],
      [
        { text: "🧹 Clear Memory", callback_data: "settings_clear_memory" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
      [
        { text: githubLabel, callback_data: "settings_github" },
        { text: "🚀 Deployments", callback_data: "settings_deployments" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

export function deploymentsKeyboard(
  hasVercel: boolean
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  rows.push([{
    text: hasVercel ? "⚡ Vercel: ✅ Connected" : "⚡ Vercel: Not set",
    callback_data: "vercel_set_token",
  }]);
  if (hasVercel) rows.push([{ text: "🗑 Remove Vercel Token", callback_data: "vercel_remove_token" }]);
  rows.push([{ text: "📁 My Projects", callback_data: "my_projects" }]);
  rows.push([{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }]);
  return { inline_keyboard: rows };
}

export function projectsListKeyboard(
  projects: Array<{ name: string; deployUrl?: string; _id?: any }>,
  page = 0
): TelegramBot.InlineKeyboardMarkup {
  const PAGE_SIZE = 5;
  const slice = projects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows: TelegramBot.InlineKeyboardButton[][] = slice.map((p, i) => {
    const globalIdx = page * PAGE_SIZE + i;
    return [
      { text: `📦 ${p.name}`, callback_data: `proj_open_${globalIdx}` },
      { text: "🗑", callback_data: `proj_del_${globalIdx}` },
    ];
  });
  const nav: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 0) nav.push({ text: "◀️ Prev", callback_data: `proj_page_${page - 1}` });
  if ((page + 1) * PAGE_SIZE < projects.length) nav.push({ text: "▶️ Next", callback_data: `proj_page_${page + 1}` });
  if (nav.length > 0) rows.push(nav);
  rows.push([
    { text: "🌐 Build Another", callback_data: "build_menu" },
    { text: "⬅️ Menu", callback_data: "main_menu" },
  ]);
  return { inline_keyboard: rows };
}

export function githubSettingsKeyboard(
  hasToken: boolean,
  username?: string
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [
    [
      { text: "✏️ Set Username", callback_data: "github_set_username" },
      { text: "🔑 Set Token", callback_data: "github_set_token" },
    ],
  ];
  if (username) {
    rows.push([{ text: "🗑 Remove Username", callback_data: "github_remove_username" }]);
  }
  if (hasToken) {
    rows.push([{ text: "🗑 Remove Token", callback_data: "github_remove_token" }]);
  }
  rows.push([{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }]);
  return { inline_keyboard: rows };
}

// ── AI Style keyboard — 2 per row ─────────────────────────────────────────────

export function styleMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  const styles: [string, string][] = [
    ["🤝 Friendly", "friendly"],
    ["😄 Funny", "funny"],
    ["💼 Serious", "serious"],
    ["⚖️ Balanced", "balanced"],
  ];
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < styles.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, styles.length); j++) {
      const [label, val] = styles[j];
      row.push({ text: (val === current ? "✅ " : "") + label, callback_data: `settings_style_${val}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Back", callback_data: "settings_menu" }]);
  return { inline_keyboard: rows };
}

// ── Reply length keyboard ─────────────────────────────────────────────────────

// ── Language keyboard — 2 per row ─────────────────────────────────────────────

export function langMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  const langs: [string, string][] = [
    ["🇬🇧 English", "en"],
    ["🇸🇦 Arabic", "ar"],
    ["🇫🇷 French", "fr"],
    ["🇪🇸 Spanish", "es"],
    ["🇩🇪 German", "de"],
    ["🇨🇳 Chinese", "zh"],
    ["🇮🇳 Hindi", "hi"],
    ["🇧🇷 Portuguese", "pt"],
    ["🇷🇺 Russian", "ru"],
    ["🇯🇵 Japanese", "ja"],
  ];
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < langs.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, langs.length); j++) {
      const [label, code] = langs[j];
      row.push({ text: (code === current ? "✅ " : "") + label, callback_data: `settings_lang_${code}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Back", callback_data: "settings_menu" }]);
  return { inline_keyboard: rows };
}

// ── Would You Rather keyboard ─────────────────────────────────────────────────

export function wyrKeyboard(idx: number): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🅰️ Option A", callback_data: `wyr_a_${idx}` },
        { text: "🅱️ Option B", callback_data: `wyr_b_${idx}` },
      ],
      [
        { text: "🔀 New Question", callback_data: "fun_wyr" },
        { text: "⬅️ Back", callback_data: "games_menu" },
      ],
    ],
  };
}

// ── Repeat / quick-action keyboard ───────────────────────────────────────────

export function repeatKeyboard(
  action: string,
  backCb = "main_menu"
): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔄 Again", callback_data: action },
        { text: "⬅️ Back", callback_data: backCb },
      ],
    ],
  };
}

// ── Trivia game keyboard ──────────────────────────────────────────────────────

export function triviaKeyboard(
  questionIdx: number,
  options: string[],
  correctIdx: number
): TelegramBot.InlineKeyboardMarkup {
  const labels = ["A", "B", "C", "D"];
  return {
    inline_keyboard: [
      ...options.map((opt, i) => [
        {
          text: `${labels[i]}. ${opt}`,
          callback_data: `game_q${questionIdx}_pick${i}_ans${correctIdx}`,
        },
      ]),
      [{ text: "⬅️ Back", callback_data: "games_menu" }],
    ],
  };
}

// ── Owner Panel Keyboards ─────────────────────────────────────────────────────

export function ownerReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📊 /stats" },    { text: "📈 /growth" },       { text: "🏆 /topusers" }],
      [{ text: "💰 /revenue" },  { text: "👥 /userlist" },     { text: "🔍 /lookup" }],
      [{ text: "📢 /broadcast" },{ text: "💎 /broadcastpremium" }],
      [{ text: "👑 /grantpremium" }, { text: "🚫 /banuser" },  { text: "✅ /unbanuser" }],
      [{ text: "🎟 /redeemcd" }, { text: "📋 /listcodes" },    { text: "🔄 /resetcode" }],
      [{ text: "🏅 /setrewards" },{ text: "🤖 /setmodel" },   { text: "⚙️ /setlimit" }],
      [{ text: "💬 /dm" },       { text: "🔄 /resetlimits" }, { text: "❌ /deleteuser" }],
      [{ text: "📊 /owner" },    { text: "🔴 /maintenance" },  { text: "🤖 /botinfo" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerMainKeyboard(maintenanceOn: boolean): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📊 Stats", callback_data: "own_stats" },
        { text: "👥 Users", callback_data: "own_users" },
      ],
      [
        { text: "💎 Premium", callback_data: "own_premium" },
        { text: "🎟 Codes", callback_data: "own_codes" },
      ],
      [
        { text: "📢 Broadcast", callback_data: "own_broadcast" },
        { text: "🏘 Groups", callback_data: "own_groups" },
      ],
      [
        { text: "💰 Promotions", callback_data: "own_promo_menu" },
        { text: "⚙️ Features", callback_data: "own_features" },
      ],
      [
        { text: "🧠 Chat Model", callback_data: "own_chat_models" },
        { text: "🖼 Image Model", callback_data: "own_img_models" },
      ],
      [
        { text: "💻 Code Model", callback_data: "own_code_models" },
      ],
      [
        {
          text: maintenanceOn ? "🔴 Maintenance: ON" : "🟢 Maintenance: OFF",
          callback_data: "own_maint",
        },
        { text: "✨ Premium Emoji", callback_data: "owner_premoji_status" },
      ],
      [
        { text: "🔍 Search User", callback_data: "own_searchuser" },
        { text: "📩 DM User", callback_data: "own_dm_btn" },
      ],
      [
        { text: "📋 Scheduled", callback_data: "own_scheduled" },
        { text: "📨 Inbox", callback_data: "own_feedback" },
      ],
    ],
  };
}

export function ownerPromoGroupsKeyboard(
  groups: Array<{ id: string; title: string; active: boolean; reward: number; verifiedCount: number }>
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (const g of groups) {
    const status = g.active ? "🟢" : "⏸";
    rows.push([
      { text: `${status} ${g.title} · ${g.reward}🪙 · ${g.verifiedCount} joined`, callback_data: `own_promo_view_${g.id}` },
    ]);
  }
  rows.push([{ text: "➕ Add Promo Group", callback_data: "own_promo_add" }]);
  rows.push([{ text: "⬅️ Back to Dashboard", callback_data: "own_panel" }]);
  return { inline_keyboard: rows };
}

export function promoGroupDetailKeyboard(id: string, active: boolean): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: active ? "⏸ Deactivate" : "▶️ Activate", callback_data: `own_promo_toggle_${id}` }],
      [{ text: "🗑 Remove Group", callback_data: `own_promo_remove_${id}` }],
      [{ text: "⬅️ Back to Promotions", callback_data: "own_promo_menu" }],
    ],
  };
}

export function earnCoinsPromoKeyboard(
  groups: Array<{ id: string; title: string; reward: number; link: string }>
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (const g of groups) {
    rows.push([{ text: `🌐 ${g.title} — earn ${g.reward} 🪙`, callback_data: `promo_view_${g.id}` }]);
  }
  rows.push([{ text: "⬅️ Back", callback_data: "credits_menu" }]);
  return { inline_keyboard: rows };
}

export function backToOwnerKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back to Dashboard", callback_data: "own_panel" }]] };
}

export function ownerUsersKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔍 Lookup User", callback_data: "own_do_lookup" },
        { text: "📋 User List", callback_data: "own_userlist_1" },
      ],
      [
        { text: "⛔ Ban User", callback_data: "own_do_ban" },
        { text: "✅ Unban User", callback_data: "own_do_unban" },
      ],
      [
        { text: "🗑 Delete User", callback_data: "own_do_del_user" },
        { text: "🧹 Clear Memory", callback_data: "own_do_clear_mem" },
      ],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerPremiumKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "➕ Grant Premium", callback_data: "own_do_grant" },
        { text: "➖ Revoke Premium", callback_data: "own_do_revoke" },
      ],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerCodesKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "➕ Create Code", callback_data: "own_do_mkcode" },
        { text: "📋 List Codes", callback_data: "own_list_codes" },
      ],
      [{ text: "🔄 Reset Code", callback_data: "own_do_reset_code" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerBroadcastKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📣 Broadcast", callback_data: "own_do_bc" },
        { text: "📢 Announcement", callback_data: "own_do_ann" },
      ],
      [{ text: "⏰ Schedule", callback_data: "own_do_sched" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerGroupsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📋 Group List", callback_data: "own_grouplist" },
        { text: "🗑 Delete Group", callback_data: "own_do_del_grp" },
      ],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerCodeModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_code_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_code_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New Model", callback_data: "own_add_code" }],
      [{ text: "🧪 Test All Models", callback_data: "own_test_code" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerChatModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_chat_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_chat_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New Model", callback_data: "own_add_chat" }],
      [{ text: "🧪 Test All Models", callback_data: "own_test_chat" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function ownerImageModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_img_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_img_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New Model", callback_data: "own_add_img" }],
      [{ text: "🧪 Test All Models", callback_data: "own_test_img" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

// ── Owner: Feature keyboards ──────────────────────────────────────────────────

export function ownerFeaturesKeyboard(features: {
  imageEnabled: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  imageAnalysisEnabled: boolean;
}): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: features.imageEnabled ? "🖼 Images: ✅" : "🖼 Images: ❌",
          callback_data: "own_feat_image",
        },
        {
          text: features.ttsEnabled ? "🔊 TTS: ✅" : "🔊 TTS: ❌",
          callback_data: "own_feat_tts",
        },
      ],
      [
        {
          text: features.sttEnabled ? "🎤 STT: ✅" : "🎤 STT: ❌",
          callback_data: "own_feat_stt",
        },
        {
          text: features.imageAnalysisEnabled ? "🔍 Vision: ✅" : "🔍 Vision: ❌",
          callback_data: "own_feat_imganalyze",
        },
      ],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

// ── User: AI Model selection keyboard ─────────────────────────────────────────

export function userModelKeyboard(
  models: IModelEntry[],
  preferredId?: string,
  globalActiveId?: string
): TelegramBot.InlineKeyboardMarkup {
  const modelRows = models.map((m, i) => {
    const isSelected = m.id === (preferredId || globalActiveId);
    return [
      {
        text: (isSelected ? "✅ " : "") + m.name,
        callback_data: `model_pick_${i}`,
      },
    ];
  });

  return {
    inline_keyboard: [
      ...modelRows,
      [{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }],
    ],
  };
}

// ── Group Settings keyboard ───────────────────────────────────────────────────

export function groupSettingsKeyboard(
  gs: {
    aiEnabled: boolean; style: string; emoji: boolean;
    antilink: boolean; antiflood: boolean; captchaEnabled: boolean;
    autoDeleteServiceMessages: boolean; locked: boolean; slowmode: number; warnLimit: number;
  },
  chatId: number
): TelegramBot.InlineKeyboardMarkup {
  const c = String(chatId);
  const on = "✅"; const off = "❌";
  return {
    inline_keyboard: [
      [
        { text: `🤖 AI: ${gs.aiEnabled ? on : off}`, callback_data: `grp_tog_aiEnabled_${c}` },
        { text: `🎭 Style: ${gs.style}`, callback_data: `grp_style_${c}` },
      ],
      [
        { text: `😂 Emoji: ${gs.emoji ? on : off}`, callback_data: `grp_tog_emoji_${c}` },
      ],
      [
        { text: `🔗 Anti-link: ${gs.antilink ? on : off}`, callback_data: `grp_tog_antilink_${c}` },
        { text: `🌊 Anti-flood: ${gs.antiflood ? on : off}`, callback_data: `grp_tog_antiflood_${c}` },
      ],
      [
        { text: `🧮 Captcha: ${gs.captchaEnabled ? on : off}`, callback_data: `grp_tog_captchaEnabled_${c}` },
        { text: `🗑 Auto-del: ${gs.autoDeleteServiceMessages ? on : off}`, callback_data: `grp_tog_autoDeleteServiceMessages_${c}` },
      ],
      [
        { text: `🔒 Locked: ${gs.locked ? on : off}`, callback_data: `grp_tog_locked_${c}` },
        { text: `⏱ Slowmode: ${gs.slowmode}s`, callback_data: `grp_slowmode_${c}` },
      ],
      [
        { text: `⚠️ Warn limit: ${gs.warnLimit}`, callback_data: `grp_warnlimit_${c}` },
        { text: `👋 Welcome msg`, callback_data: `grp_welcome_${c}` },
      ],
      [
        { text: `📋 Rules`, callback_data: `grp_rules_${c}` },
        { text: `👋 Goodbye`, callback_data: `grp_goodbye_${c}` },
      ],
      [{ text: `🔗 Generate Invite Link`, callback_data: `grp_invite_${c}` }],
      [{ text: "❌ Close", callback_data: "grp_settings_close" }],
    ],
  };
}

export function groupStyleKeyboard(chatId: number, current: string): TelegramBot.InlineKeyboardMarkup {
  const c = String(chatId);
  const styles = ["friendly", "funny", "serious", "balanced"];
  return {
    inline_keyboard: [
      styles.slice(0, 2).map(s => ({ text: (s === current ? "✅ " : "") + s, callback_data: `grp_setstyle_${s}_${c}` })),
      styles.slice(2).map(s => ({ text: (s === current ? "✅ " : "") + s, callback_data: `grp_setstyle_${s}_${c}` })),
      [{ text: "⬅️ Back", callback_data: `grp_back_${c}` }],
    ],
  };
}

// ── Daily reward keyboard ─────────────────────────────────────────────────────

export function dailyRewardKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🎁 Claim Daily Reward", callback_data: "daily_claim" }],
      [
        { text: "👥 Refer a Friend", callback_data: "refer_link" },
        { text: "⬅️ Menu", callback_data: "main_menu" },
      ],
    ],
  };
}

// ── Owner user list pagination ────────────────────────────────────────────────

export function ownerUserListKeyboard(
  page: number,
  totalPages: number
): TelegramBot.InlineKeyboardMarkup {
  const nav: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 1) nav.push({ text: "◀️ Prev", callback_data: `own_userlist_${page - 1}` });
  if (page < totalPages) nav.push({ text: "Next ▶️", callback_data: `own_userlist_${page + 1}` });

  return {
    inline_keyboard: [
      ...(nav.length > 0 ? [nav] : []),
      [{ text: "⬅️ Back", callback_data: "own_users" }],
    ],
  };
}


// ── TTS keyboard ──────────────────────────────────────────────────────────────

export function ttsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back", callback_data: "ai_menu" }],
    ],
  };
}

// ── Onboarding keyboards ──────────────────────────────────────────────────────

export function onboardingWelcomeKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 Show me around!", callback_data: "onboard_step_1" }],
      [{ text: "⏭️ Skip — take me to the menu", callback_data: "onboard_skip" }],
    ],
  };
}

export function onboardingStyleKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🤝 Friendly & Helpful", callback_data: "onboard_style_friendly" },
        { text: "😄 Funny & Playful",    callback_data: "onboard_style_funny" },
      ],
      [
        { text: "💼 Professional",        callback_data: "onboard_style_serious" },
        { text: "⚖️ Balanced",            callback_data: "onboard_style_balanced" },
      ],
      [{ text: "⏭ Skip", callback_data: "onboard_skip" }],
    ],
  };
}

export function onboardingStep1Keyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Next: Images & Stickers →", callback_data: "onboard_step_2" }],
      [{ text: "⏭️ Skip to menu", callback_data: "onboard_skip" }],
    ],
  };
}

export function onboardingStep2Keyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Next: Build & Deploy →", callback_data: "onboard_step_3" }],
      [{ text: "⏭️ Skip to menu", callback_data: "onboard_skip" }],
    ],
  };
}

export function onboardingStep3Keyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Next: Rewards & Streaks →", callback_data: "onboard_step_4" }],
      [{ text: "⏭️ Skip to menu", callback_data: "onboard_skip" }],
    ],
  };
}

export function onboardingDoneKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💬 Start Chatting",    callback_data: "ai_ask" }],
      [{ text: "🎨 Generate an Image", callback_data: "img_generate" }],
      [{ text: "🌐 Build a Website",   callback_data: "build_menu" }],
      [{ text: "📋 See Full Menu",     callback_data: "main_menu" }],
    ],
  };
}

// ── Welcome-back keyboard (recent features as quick shortcuts) ────────────────

export function welcomeBackKeyboard(
  recentFeatures: string[],
  activeMode?: string
): TelegramBot.InlineKeyboardMarkup {
  const FEATURE_BTNS: Record<string, { text: string; cb: string }> = {
    chat:      { text: "💬 Chat",        cb: "ai_ask" },
    image:     { text: "🎨 Image",       cb: "img_generate" },
    build:     { text: "🌐 Build",       cb: "build_menu" },
    search:    { text: "🔍 Search",      cb: "search_btn" },
    translate: { text: "🌍 Translate",   cb: "ai_translate" },
    summarize: { text: "📝 Summarize",   cb: "ai_summarize" },
    sticker:   { text: "🖼️ Sticker",    cb: "sticker_btn" },
    describe:  { text: "🔬 Describe",    cb: "ai_menu" },
  };
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  const validFeatures = recentFeatures.filter(f => FEATURE_BTNS[f]).slice(0, 4);
  if (validFeatures.length > 0) {
    for (let i = 0; i < validFeatures.length; i += 2) {
      const row: TelegramBot.InlineKeyboardButton[] = [];
      for (let j = i; j < Math.min(i + 2, validFeatures.length); j++) {
        const f = validFeatures[j];
        row.push({ text: FEATURE_BTNS[f].text, callback_data: FEATURE_BTNS[f].cb });
      }
      rows.push(row);
    }
  }
  rows.push([{ text: "📋 Full Menu", callback_data: "main_menu" }]);
  return { inline_keyboard: rows };
}

// ── Privacy keyboard ──────────────────────────────────────────────────────────

export function privacyMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🗑️ Delete My Data", callback_data: "privacy_delete_data" },
        { text: "📤 Export My Data", callback_data: "export_btn" },
      ],
      [{ text: "🧹 Clear Chat Memory", callback_data: "forget_memory" }],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── What's New keyboard ───────────────────────────────────────────────────────

export function whatsNewKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "⭐ Go Premium", callback_data: "settings_premium" },
        { text: "🏅 Achievements", callback_data: "achievements_menu" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Achievements keyboard ─────────────────────────────────────────────────────

export function achievementsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🎁 Daily Reward",  callback_data: "daily_reward" },
        { text: "👥 Refer Friends", callback_data: "referral_menu" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Privacy keyboard (compact) ────────────────────────────────────────────────

export function privacyKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🗑 Delete My Data",   callback_data: "privacy_delete_data" }],
      [{ text: "🧹 Clear Memory",     callback_data: "forget_memory" }],
      [{ text: "⬅️ Menu",             callback_data: "main_menu" }],
    ],
  };
}

// ── What's New / Updates keyboard ────────────────────────────────────────────

export function updatesKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📢 Send Feedback", callback_data: "feedback_btn" },
        { text: "⬅️ Menu",          callback_data: "main_menu" },
      ],
    ],
  };
}

// ── Settings keyboard with Privacy ───────────────────────────────────────────

export function settingsMenuWithPrivacyKeyboard(user: IUser): TelegramBot.InlineKeyboardMarkup {
  const moodLabel = user.mood ? `😶 Mood: ${user.mood}` : "😶 Set Mood";
  const githubLabel = user.github?.username ? `✅ GitHub` : "🔑 GitHub";
  const emojiLabel = user.settings.emoji ? "😊 Emojis: ON" : "😑 Emojis: OFF";
  const emojiCb = user.settings.emoji ? "settings_emoji_off" : "settings_emoji_on";
  return {
    inline_keyboard: [
      [
        { text: "👤 My Profile", callback_data: "settings_profile" },
        { text: "📊 My Stats",   callback_data: "show_stats" },
      ],
      [
        { text: "🎭 AI Style",  callback_data: "settings_style" },
        { text: "🌐 Language",  callback_data: "settings_lang" },
      ],
      [
        { text: moodLabel,      callback_data: "settings_mood" },
      ],
      [
        { text: emojiLabel,       callback_data: emojiCb },
        { text: "🤖 AI Model",    callback_data: "model_panel" },
      ],
      [
        { text: "🧹 Clear Memory", callback_data: "settings_clear_memory" },
        { text: "💎 Premium",      callback_data: "settings_premium" },
      ],
      [
        { text: githubLabel,         callback_data: "settings_github" },
        { text: "🚀 Deployments",    callback_data: "settings_deployments" },
      ],
      [
        { text: "🔒 Privacy",        callback_data: "privacy_menu" },
        { text: "🏅 Achievements",   callback_data: "achievements_menu" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
    ],
  };
}

// ── Build menu keyboard ───────────────────────────────────────────────────────

export function buildMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🌐 Website",       callback_data: "build_website" },
        { text: "⚛️ React App",     callback_data: "build_react" },
      ],
      [
        { text: "🖥️ Dashboard",     callback_data: "build_dashboard" },
        { text: "🛒 Landing Page",  callback_data: "build_landing" },
      ],
      [{ text: "✏️ Describe my idea...", callback_data: "build_custom" }],
      [
        { text: "📁 My Projects",   callback_data: "my_projects" },
        { text: "⬅️ Menu",          callback_data: "main_menu" },
      ],
    ],
  };
}

// ── Main menu with What's New indicator ───────────────────────────────────────

export function mainMenuWithNewsKeyboard(hasNews = false): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Chat",   callback_data: "ai_menu" },
        { text: "🎨 Create", callback_data: "img_menu" },
      ],
      [
        { text: "🌐 Build",   callback_data: "build_menu" },
        { text: "🔍 Search",  callback_data: "search_btn" },
      ],
      [
        { text: "😄 Fun",    callback_data: "fun_menu" },
        { text: "🎮 Games",  callback_data: "games_menu" },
      ],
      [
        { text: "⏰ Reminders", callback_data: "reminders_btn" },
        { text: "🎁 Daily Reward", callback_data: "daily_reward" },
      ],
      [
        { text: "📊 My Account", callback_data: "account_menu" },
        { text: "💰 Credits",    callback_data: "credits_menu" },
      ],
      [
        { text: "⭐ Go Premium", callback_data: "settings_premium" },
        { text: "⚙️ Settings",  callback_data: "settings_menu" },
      ],
      [
        { text: hasNews ? "🆕 What's New!" : "🔔 What's New", callback_data: "whats_new_menu" },
      ],
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════
// ── Reply Keyboards for All Submenus ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════

export function chatMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "💬 Ask Nova" }, { text: "📝 Summarize" }],
      [{ text: "🌍 Translate" }, { text: "✍️ Write for Me" }],
      [{ text: "🗣️ Debate Me" }, { text: "🔬 Analyze Text" }],
      [{ text: "📜 Chat History" }, { text: "🧹 Clear Memory" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function writeMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🐦 Tweet" }, { text: "📸 IG Caption" }],
      [{ text: "👤 Bio" }, { text: "🎵 Song Lyrics" }],
      [{ text: "📧 Email" }, { text: "🎭 Poem" }],
      [{ text: "⬅️ Chat Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function createMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "✨ Generate Image" }, { text: "🎨 Style Presets" }],
      [{ text: "🖼️ Create Sticker" }, { text: "✏️ Edit Image" }],
      [{ text: "🔆 Enhance Photo" }, { text: "🎭 Stylize Photo" }],
      [{ text: "🔧 Restore Photo" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function imgStyleReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🎌 Anime" }, { text: "🤖 Cyberpunk" }],
      [{ text: "🌌 Fantasy" }, { text: "📸 Realistic" }],
      [{ text: "🎨 Oil Painting" }, { text: "💧 Watercolor" }],
      [{ text: "✏️ Sketch" }, { text: "👾 Pixel Art" }],
      [{ text: "⬅️ Create Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function buildSubMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🌐 Website" }, { text: "⚛️ React App" }],
      [{ text: "🖥️ Dashboard" }, { text: "🛒 Landing Page" }],
      [{ text: "💡 Custom Idea" }],
      [{ text: "📁 My Projects" }, { text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function buildResultMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "⚡ Deploy to Vercel" }, { text: "🟣 Deploy to Render" }],
      [{ text: "📁 My Projects" }, { text: "🌐 Build Another" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function funSubMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "😂 Joke" }, { text: "🎱 Magic 8-Ball" }],
      [{ text: "💘 Ship Us" }, { text: "🔥 Roast Me" }],
      [{ text: "🧠 IQ Test" }, { text: "🌟 Compliment" }],
      [{ text: "🔮 Fortune" }, { text: "😈 Daily Dare" }],
      [{ text: "✨ Vibe Check" }, { text: "💭 Truth Question" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function gamesSubMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🎯 Trivia" }, { text: "🤔 Would You Rather" }],
      [{ text: "📖 Word of the Day" }, { text: "🎲 Random Fact" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function triviaOptionsReplyKeyboard(options: string[]): TelegramBot.ReplyKeyboardMarkup {
  const rows: TelegramBot.KeyboardButton[][] = [];
  for (let i = 0; i < options.length; i += 2) {
    const row: TelegramBot.KeyboardButton[] = [{ text: options[i] }];
    if (options[i + 1]) row.push({ text: options[i + 1] });
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Games Menu" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

export function wyrOptionsReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🅰️ Option A" }, { text: "🅱️ Option B" }],
      [{ text: "🔀 New Question" }, { text: "⬅️ Games Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function settingsReplyKeyboard(user: IUser): TelegramBot.ReplyKeyboardMarkup {
  const emojiLabel = user.settings.emoji ? "😊 Emojis: ON" : "😑 Emojis: OFF";
  const githubLabel = user.github?.username ? "✅ GitHub" : "🔑 GitHub";
  return {
    keyboard: [
      [{ text: "👤 My Profile" }, { text: "📊 My Stats" }],
      [{ text: "🎭 AI Style" }],
      [{ text: "🌐 Language" }, { text: "😶 Set Mood" }],
      [{ text: emojiLabel }, { text: "🤖 AI Model" }],
      [{ text: "💎 Premium Plans" }, { text: githubLabel }],
      [{ text: "🚀 Deployments" }, { text: "🔒 Privacy" }],
      [{ text: "🏅 Achievements" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function aiStyleReplyKeyboard(current: string): TelegramBot.ReplyKeyboardMarkup {
  const mark = (style: string, label: string) => ({ text: (current === style ? "✅ " : "") + label });
  return {
    keyboard: [
      [mark("friendly", "🤝 Friendly"), mark("funny", "😄 Funny Style")],
      [mark("serious", "💼 Serious"), mark("balanced", "⚖️ Balanced")],
      [{ text: "⬅️ Settings" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function langMenuReplyKeyboard(current: string): TelegramBot.ReplyKeyboardMarkup {
  const langs: [string, string][] = [
    ["🇬🇧 English", "en"], ["🇸🇦 Arabic", "ar"],
    ["🇫🇷 French", "fr"], ["🇪🇸 Spanish", "es"],
    ["🇩🇪 German", "de"], ["🇨🇳 Chinese", "zh"],
    ["🇮🇳 Hindi", "hi"], ["🇧🇷 Portuguese", "pt"],
    ["🇷🇺 Russian", "ru"], ["🇯🇵 Japanese", "ja"],
  ];
  const keyboard: TelegramBot.KeyboardButton[][] = [];
  for (let i = 0; i < langs.length; i += 2) {
    keyboard.push([
      { text: (langs[i][1] === current ? "✅ " : "") + langs[i][0] },
      { text: (langs[i + 1][1] === current ? "✅ " : "") + langs[i + 1][0] },
    ]);
  }
  keyboard.push([{ text: "⬅️ Settings" }]);
  return { keyboard, resize_keyboard: true, is_persistent: true };
}

export function moodReplyKeyboard(current?: string): TelegramBot.ReplyKeyboardMarkup {
  const moods: [string, string][] = [
    ["😊 Happy", "happy"], ["😔 Sad", "sad"],
    ["😤 Stressed", "stressed"], ["😴 Bored", "bored"],
    ["🤩 Excited", "excited"], ["🎯 Focused", "focused"],
    ["😍 Romantic", "romantic"], ["😠 Angry", "angry"],
  ];
  const keyboard: TelegramBot.KeyboardButton[][] = [];
  for (let i = 0; i < moods.length; i += 2) {
    keyboard.push([
      { text: (moods[i][1] === current ? "✅ " : "") + moods[i][0] },
      { text: (moods[i + 1][1] === current ? "✅ " : "") + moods[i + 1][0] },
    ]);
  }
  keyboard.push([{ text: "🗑️ Clear Mood" }, { text: "⬅️ Settings" }]);
  return { keyboard, resize_keyboard: true, is_persistent: true };
}

export function creditsReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🌱 50 Credits — 15⭐" }, { text: "⚡ 150 Credits — 40⭐" }],
      [{ text: "🚀 500 Credits — 115⭐" }, { text: "💎 1500 Credits — 299⭐" }],
      [{ text: "⭐ VIP Monthly — 149⭐" }, { text: "👑 VIP Lifetime — 499⭐" }],
      [{ text: "🎁 Claim Daily" }, { text: "👥 Invite Friends" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function accountReplyKeyboard(isPremium: boolean): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "💰 Credits & Packs" }, { text: "🎁 Daily Reward" }],
      [{ text: "👥 Referral Link" }, ...(isPremium ? [] : [{ text: "⭐ Upgrade VIP" }])],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function dailyMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🎰 Claim Reward" }],
      [{ text: "👥 Invite Friends" }, { text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function achievementsMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🎁 Daily Reward" }, { text: "👥 Refer Friends" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function privacyReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🗑️ Delete My Data" }, { text: "📤 Export Data" }],
      [{ text: "🧹 Clear Memory" }],
      [{ text: "⬅️ Settings" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function deploymentsMenuReplyKeyboard(hasVercel: boolean): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: hasVercel ? "⚡ Vercel: ✅ Connected" : "⚡ Vercel: Not set" }],
      ...(hasVercel ? [[{ text: "🗑 Remove Vercel" }]] : []),
      [{ text: "📁 My Projects" }, { text: "⬅️ Settings" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function githubMenuReplyKeyboard(hasToken: boolean, username?: string): TelegramBot.ReplyKeyboardMarkup {
  const rows: TelegramBot.KeyboardButton[][] = [
    [{ text: "✏️ Set Username" }, { text: "🔑 Set Token" }],
  ];
  if (username) rows.push([{ text: "🗑 Remove Username" }]);
  if (hasToken) rows.push([{ text: "🗑 Remove Token" }]);
  rows.push([{ text: "⬅️ Settings" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

export function remindersMenuReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "➕ Set Reminder" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerMainReplyKeyboard(maintenanceOn: boolean): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📊 Stats" }, { text: "👥 Users" }],
      [{ text: "💎 Premium" }, { text: "🎟 Codes" }],
      [{ text: "📢 Broadcast" }, { text: "🏘 Groups" }],
      [{ text: "💰 Promotions" }, { text: "⚙️ Features" }],
      [{ text: "🧠 Chat Model" }, { text: "🖼 Image Model" }],
      [{ text: "💻 Code Model" }],
      [{ text: maintenanceOn ? "🔴 Maintenance: ON" : "🟢 Maintenance: OFF" }, { text: "✨ Premium Emoji" }],
      [{ text: "🔍 Search User" }, { text: "📩 DM User" }],
      [{ text: "📋 Scheduled" }, { text: "📨 Inbox" }],
      [{ text: "⬅️ Main Menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerUsersReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "🔍 Lookup User" }, { text: "📋 User List" }],
      [{ text: "⛔ Ban User" }, { text: "✅ Unban User" }],
      [{ text: "🗑 Delete User" }, { text: "🧹 Clear User Memory" }],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerPremiumReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "➕ Grant Premium" }, { text: "➖ Revoke Premium" }],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerCodesReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "➕ Create Code" }, { text: "📋 List Codes" }],
      [{ text: "🔄 Reset Code" }],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerBroadcastReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📣 Broadcast All" }, { text: "📢 Announcement" }],
      [{ text: "⏰ Schedule Message" }, { text: "📋 Scheduled" }],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerGroupsReplyKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📋 Group List" }, { text: "🗑 Delete Group" }],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ownerFeaturesMenuReplyKeyboard(imageEnabled: boolean, visionEnabled: boolean): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [
        { text: `🖼 Images: ${imageEnabled ? "✅ ON" : "❌ OFF"}` },
        { text: `🔍 Vision: ${visionEnabled ? "✅ ON" : "❌ OFF"}` },
      ],
      [{ text: "⬅️ Owner Panel" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
