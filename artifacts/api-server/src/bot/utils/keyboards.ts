import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";
import { IModelEntry } from "../models/BotConfig.js";
import { MODES, ModeDefinition } from "../services/modeManager.js";

// ── Main dashboard ────────────────────────────────────────────────────────────

export function mainMenuKeyboard(activeMode?: string): TelegramBot.InlineKeyboardMarkup {
  const mode = MODES.find(m => m.id === activeMode) ?? MODES[0];
  const modeLabel = `${mode.icon} Mode: ${mode.name}`;
  return {
    inline_keyboard: [
      [
        { text: "🧠 AI Tools", callback_data: "ai_menu" },
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
        { text: modeLabel, callback_data: "modes_menu" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "settings_menu" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
    ],
  };
}

// ── Build result keyboard ─────────────────────────────────────────────────────

export function buildResultKeyboard(
  repoUrl?: string,
  canDeployVercel = false,
  canDeployRender = false
): TelegramBot.InlineKeyboardMarkup {
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  if (repoUrl) {
    buttons.push([{ text: "🔗 Open on GitHub", url: repoUrl }]);
  }
  const deployRow: TelegramBot.InlineKeyboardButton[] = [];
  if (canDeployVercel) deployRow.push({ text: "⚡ Deploy to Vercel", callback_data: "deploy_live" });
  if (canDeployRender) deployRow.push({ text: "🟣 Deploy to Render", callback_data: "deploy_render" });
  if (deployRow.length > 0) buttons.push(deployRow);
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
        { text: "🔊 Text-to-Speech", callback_data: "tts_btn" },
      ],
      [
        { text: "✏️ Edit via Prompt", callback_data: "img_edit" },
        { text: "🔆 Enhance Photo", callback_data: "img_enhance" },
      ],
      [
        { text: "🎭 Stylize", callback_data: "img_stylize" },
        { text: "🔧 Restore", callback_data: "img_restore" },
      ],
      [{ text: "⬅️ Menu", callback_data: "main_menu" }],
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
  hasVercel: boolean,
  hasRender: boolean
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  rows.push([{
    text: hasVercel ? "⚡ Vercel: ✅ Connected" : "⚡ Vercel: Not set",
    callback_data: "vercel_set_token",
  }]);
  if (hasVercel) rows.push([{ text: "🗑 Remove Vercel Token", callback_data: "vercel_remove_token" }]);
  rows.push([{
    text: hasRender ? "🟣 Render: ✅ Connected" : "🟣 Render: Not set",
    callback_data: "render_set_token",
  }]);
  if (hasRender) rows.push([{ text: "🗑 Remove Render Token", callback_data: "render_remove_token" }]);
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
  rows.push([{ text: "⬅️ Back", callback_data: "settings_deployments" }]);
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

export function lengthMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: (current === "short" ? "✅ " : "") + "📌 Short",
          callback_data: "settings_length_short",
        },
        {
          text: (current === "long" ? "✅ " : "") + "📖 Long",
          callback_data: "settings_length_long",
        },
      ],
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

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
        { text: "🧠 Chat Model", callback_data: "own_chat_models" },
        { text: "🖼 Image Model", callback_data: "own_img_models" },
      ],
      [
        { text: "🔌 Providers", callback_data: "own_providers" },
        { text: "⚙️ Features", callback_data: "own_features" },
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
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

// ── Owner: Provider & Feature keyboards ──────────────────────────────────────

export function ownerProvidersKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💬 Chat Providers", callback_data: "own_chat_providers" },
        { text: "🖼 Image Providers", callback_data: "own_img_providers" },
      ],
      [{ text: "🔊 TTS Provider", callback_data: "own_tts_provider" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

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

export function ownerChatProvidersKeyboard(providers: {
  freeChat: { provider: string; model: string };
  premiumChat: { provider: string; model: string };
  groupChat: { provider: string; model: string };
}): TelegramBot.InlineKeyboardMarkup {
  const label = (slot: { provider: string; model: string }) => {
    if (slot.provider === "pollinations") return "Pollinations";
    return `OR: ${slot.model.split("/").pop()?.replace(/:free$/, "") || slot.model}`;
  };
  return {
    inline_keyboard: [
      [{ text: `👤 Free: ${label(providers.freeChat)}`, callback_data: "own_chat_slot_free" }],
      [{ text: `💎 Premium: ${label(providers.premiumChat)}`, callback_data: "own_chat_slot_premium" }],
      [{ text: `👥 Groups: ${label(providers.groupChat)}`, callback_data: "own_chat_slot_group" }],
      [{ text: "⬅️ Back", callback_data: "own_providers" }],
    ],
  };
}

export function ownerPickChatProviderKeyboard(slot: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🆓 Pollinations (free, no key)", callback_data: `own_chat_prov_${slot}_pollinations` }],
      [{ text: "🔑 OpenRouter (API key required)", callback_data: `own_chat_prov_${slot}_openrouter` }],
      [{ text: "⬅️ Back", callback_data: "own_chat_providers" }],
    ],
  };
}

export function ownerPickOpenRouterModelKeyboard(
  slot: string,
  models: IModelEntry[]
): TelegramBot.InlineKeyboardMarkup {
  const rows = models.map((m, i) => [{
    text: m.name,
    callback_data: `own_chat_model_${slot}_${i}`,
  }]);
  return {
    inline_keyboard: [
      ...rows,
      [{ text: "⬅️ Back", callback_data: `own_chat_slot_${slot}` }],
    ],
  };
}

export function ownerImageProvidersKeyboard(providers: {
  freeImage: string;
  premiumImage: string;
  groupImage: string;
}): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: `👤 Free: ${providers.freeImage}`, callback_data: "own_img_slot_free" }],
      [{ text: `💎 Premium: ${providers.premiumImage}`, callback_data: "own_img_slot_premium" }],
      [{ text: `👥 Groups: ${providers.groupImage}`, callback_data: "own_img_slot_group" }],
      [{ text: "⬅️ Back", callback_data: "own_providers" }],
    ],
  };
}

export function ownerPickImageProviderKeyboard(slot: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🤗 HuggingFace (API key required)", callback_data: `own_img_prov_${slot}_huggingface` }],
      [{ text: "🆓 Pollinations (free, no key)", callback_data: `own_img_prov_${slot}_pollinations` }],
      [{ text: "⬅️ Back", callback_data: "own_img_providers" }],
    ],
  };
}

export function ownerTtsKeyboard(tts: string, ttsVoice: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: tts === "huggingface" ? "✅ HuggingFace" : "HuggingFace",
          callback_data: "own_tts_prov_huggingface",
        },
        {
          text: tts === "openrouter" ? "✅ OpenRouter" : "OpenRouter",
          callback_data: "own_tts_prov_openrouter",
        },
      ],
      [{ text: `🎙 Voice: ${ttsVoice}`, callback_data: "own_tts_voice" }],
      [{ text: "⬅️ Back", callback_data: "own_providers" }],
    ],
  };
}

export function ownerPickTtsVoiceKeyboard(): TelegramBot.InlineKeyboardMarkup {
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < voices.length; i += 3) {
    rows.push(voices.slice(i, i + 3).map(v => ({ text: v, callback_data: `own_tts_voice_${v}` })));
  }
  rows.push([{ text: "⬅️ Back", callback_data: "own_tts_provider" }]);
  return { inline_keyboard: rows };
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
    aiEnabled: boolean; style: string; emoji: boolean; length: string;
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
        { text: `😂 Emoji: ${gs.emoji ? on : off}`, callback_data: `grp_tog_emoji_${c}` },
      ],
      [
        { text: `🎭 Style: ${gs.style}`, callback_data: `grp_style_${c}` },
        { text: `📏 Length: ${gs.length}`, callback_data: `grp_tog_length_${c}` },
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

// ── Mode selection keyboard ───────────────────────────────────────────────────

export function modeSelectKeyboard(activeMode: string): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < MODES.length; i += 2) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let j = i; j < Math.min(i + 2, MODES.length); j++) {
      const m = MODES[j];
      const isActive = m.id === activeMode;
      row.push({
        text: (isActive ? "✅ " : "") + `${m.icon} ${m.name}`,
        callback_data: `mode_set_${m.id}`,
      });
    }
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Menu", callback_data: "main_menu" }]);
  return { inline_keyboard: rows };
}

export function currentModeKeyboard(mode: ModeDefinition): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔄 Switch Mode", callback_data: "modes_menu" },
        { text: "⬅️ Menu", callback_data: "main_menu" },
      ],
    ],
  };
}

// ── TTS keyboard ──────────────────────────────────────────────────────────────

export function ttsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Back", callback_data: "img_menu" }],
    ],
  };
}
