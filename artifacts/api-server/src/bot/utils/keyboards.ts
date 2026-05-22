import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";
import { IModelEntry } from "../models/BotConfig.js";

// ── Main dashboard ────────────────────────────────────────────────────────────

export function mainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🤖 AI Tools", callback_data: "ai_menu" },
        { text: "🎨 Image & Media", callback_data: "img_menu" },
      ],
      [
        { text: "🌐 Build App/Website", callback_data: "build_menu" },
      ],
      [
        { text: "🔍 Web Search", callback_data: "search_btn" },
        { text: "⏰ Reminders", callback_data: "reminders_btn" },
      ],
      [
        { text: "😄 Fun", callback_data: "fun_menu" },
        { text: "🎮 Games", callback_data: "games_menu" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "settings_menu" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
    ],
  };
}

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

export function backToMainKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] };
}

export function backToSettingsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "settings_menu" }]] };
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
        { text: "🎱 8-Ball", callback_data: "fun_8ball" },
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
        { text: "💭 Truth", callback_data: "fun_truth" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
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
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
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
        { text: "💬 Ask AI", callback_data: "ai_ask" },
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
        { text: "🔍 Web Search", callback_data: "search_btn" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
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
        { text: "✏️ Edit via Prompt", callback_data: "img_edit" },
        { text: "🔆 Enhance", callback_data: "img_enhance" },
      ],
      [
        { text: "🎭 Stylize", callback_data: "img_stylize" },
        { text: "🔧 Restore", callback_data: "img_restore" },
      ],
      [
        { text: "🎵 Generate Music", callback_data: "music_btn" },
      ],
      [
        { text: "🖼️ Create Sticker", callback_data: "sticker_btn" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
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
  rows.push([{ text: "🗑️ Clear Mood", callback_data: "mood_clear" }]);
  rows.push([{ text: "⬅️ Back", callback_data: "settings_menu" }]);

  return { inline_keyboard: rows };
}

// ── Settings menu ─────────────────────────────────────────────────────────────

export function settingsMenuKeyboard(user: IUser): TelegramBot.InlineKeyboardMarkup {
  const moodLabel = user.mood ? `😶 Mood: ${user.mood}` : "😶 Set Mood";
  const githubLabel = user.github?.username ? `🔑 GitHub: @${user.github.username}` : "🔑 GitHub";
  const vercelConnected = !!(user as any).vercelTokenEncrypted;
  const renderConnected = !!(user as any).renderTokenEncrypted;
  const deployLabel = vercelConnected || renderConnected
    ? `🚀 Deployments ✅`
    : "🚀 Deployments";
  return {
    inline_keyboard: [
      [
        { text: "👤 My Profile", callback_data: "settings_profile" },
        {
          text: user.settings.emoji ? "😊 Emojis: ON" : "😑 Emojis: OFF",
          callback_data: user.settings.emoji ? "settings_emoji_off" : "settings_emoji_on",
        },
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
        { text: "🤖 AI Model", callback_data: "model_panel" },
      ],
      [
        { text: "🧹 Clear Memory", callback_data: "settings_clear_memory" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
      [
        { text: githubLabel, callback_data: "settings_github" },
        { text: deployLabel, callback_data: "settings_deployments" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
}

export function deploymentsKeyboard(
  hasVercel: boolean,
  hasRender: boolean
): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: hasVercel ? "⚡ Vercel: Connected ✅" : "⚡ Vercel: Not set",
          callback_data: "vercel_set_token",
        },
      ],
      ...(hasVercel ? [[{ text: "🗑 Remove Vercel Token", callback_data: "vercel_remove_token" }]] : []),
      [
        {
          text: hasRender ? "🟣 Render: Connected ✅" : "🟣 Render: Not set",
          callback_data: "render_set_token",
        },
      ],
      ...(hasRender ? [[{ text: "🗑 Remove Render Token", callback_data: "render_remove_token" }]] : []),
      [{ text: "📁 My Projects", callback_data: "my_projects" }],
      [{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }],
    ],
  };
}

export function projectsListKeyboard(
  projects: Array<{ name: string; deployUrl?: string; _id?: any }>,
  page = 0
): TelegramBot.InlineKeyboardMarkup {
  const PAGE_SIZE = 5;
  const slice = projects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows: TelegramBot.InlineKeyboardButton[][] = slice.map((p, i) => {
    const globalIdx = page * PAGE_SIZE + i;
    const row: TelegramBot.InlineKeyboardButton[] = [
      { text: `📦 ${p.name}`, callback_data: `proj_open_${globalIdx}` },
      { text: "🗑", callback_data: `proj_del_${globalIdx}` },
    ];
    return row;
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

export function styleMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  const styles: [string, string][] = [
    ["🤝 Friendly", "friendly"],
    ["😄 Funny", "funny"],
    ["💼 Serious", "serious"],
    ["⚖️ Balanced", "balanced"],
  ];
  return {
    inline_keyboard: [
      ...styles.map(([label, val]) => [
        {
          text: (val === current ? "✅ " : "") + label,
          callback_data: `settings_style_${val}`,
        },
      ]),
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

export function lengthMenuKeyboard(current: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: (current === "short" ? "✅ " : "") + "📌 Short replies",
          callback_data: "settings_length_short",
        },
      ],
      [
        {
          text: (current === "long" ? "✅ " : "") + "📖 Long replies",
          callback_data: "settings_length_long",
        },
      ],
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

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
  ];
  return {
    inline_keyboard: [
      ...langs.map(([label, code]) => [
        {
          text: (code === current ? "✅ " : "") + label,
          callback_data: `settings_lang_${code}`,
        },
      ]),
      [{ text: "⬅️ Back", callback_data: "settings_menu" }],
    ],
  };
}

// ── Would You Rather keyboard ─────────────────────────────────────────────────

export function wyrKeyboard(idx: number): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🅰️  Option A", callback_data: `wyr_a_${idx}` },
        { text: "🅱️  Option B", callback_data: `wyr_b_${idx}` },
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

// ── Trivia game ───────────────────────────────────────────────────────────────

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
        { text: "📊 Full Stats", callback_data: "own_stats" },
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


// ── User: AI Model selection keyboard ─────────────────────────────────────────

export function userModelKeyboard(
  models: IModelEntry[],
  preferredId?: string,
  globalActiveId?: string
): TelegramBot.InlineKeyboardMarkup {
  const modelRows = models.map((m) => {
    const isSelected = m.id === (preferredId || globalActiveId);
    return [
      {
        text: (isSelected ? "✅ " : "") + m.name,
        callback_data: `model_pick_${models.indexOf(m)}`,
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
