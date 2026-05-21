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
  const voiceLabel = user.settings?.voiceEnabled ? "🔊 Voice: ON" : "🔇 Voice: OFF";
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
        { text: voiceLabel, callback_data: "voice_panel" },
      ],
      [
        { text: "🧹 Clear Memory", callback_data: "settings_clear_memory" },
        { text: "💎 Premium", callback_data: "settings_premium" },
      ],
      [{ text: "⬅️ Back", callback_data: "main_menu" }],
    ],
  };
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
        { text: "🎬 Video Model", callback_data: "own_vid_models" },
        { text: "🔊 Voice Model", callback_data: "own_voice_models" },
      ],
      [
        { text: "🎙 Speech (ASR)", callback_data: "own_asr_models" },
        {
          text: maintenanceOn ? "🔴 Maintenance: ON" : "🟢 Maintenance: OFF",
          callback_data: "own_maint",
        },
      ],
      [
        { text: "⚡ Provider Control", callback_data: "prov_main" },
        { text: "✨ Premium Emoji", callback_data: "owner_premoji_status" },
      ],
    ],
  };
}

export function ownerAsrModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_asr_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_asr_${i}`,
    },
  ]);
  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New ASR Model", callback_data: "own_add_asr" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
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

export function ownerVideoModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_vid_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_vid_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New Model", callback_data: "own_add_vid" }],
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

// ── User: Voice settings keyboard ─────────────────────────────────────────────

export function voiceSettingsKeyboard(
  voiceEnabled: boolean,
  currentVoiceId: string,
  voices: IModelEntry[]
): TelegramBot.InlineKeyboardMarkup {
  const voiceRows = voices.map((v, i) => [
    {
      text: (v.id === currentVoiceId ? "✅ " : "") + v.name,
      callback_data: `voice_pick_${i}`,
    },
    {
      text: "▶️ Preview",
      callback_data: `voice_preview_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      [
        {
          text: voiceEnabled ? "🔊 Voice: ON — tap to turn OFF" : "🔇 Voice: OFF — tap to turn ON",
          callback_data: "voice_toggle",
        },
      ],
      ...(voiceEnabled ? voiceRows : []),
      [{ text: "⬅️ Back to Settings", callback_data: "settings_menu" }],
    ],
  };
}

// ── Owner: Voice models keyboard ───────────────────────────────────────────────

export function ownerVoiceModelsKeyboard(
  models: IModelEntry[],
  activeId: string
): TelegramBot.InlineKeyboardMarkup {
  const modelButtons = models.map((m, i) => [
    {
      text: (m.id === activeId ? "✅ " : "") + m.name,
      callback_data: `own_set_voice_${i}`,
    },
    {
      text: "🗑",
      callback_data: `own_del_voice_${i}`,
    },
  ]);

  return {
    inline_keyboard: [
      ...modelButtons,
      [{ text: "➕ Add New Voice", callback_data: "own_add_voice" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

// ── Provider Control Keyboards ────────────────────────────────────────────────

export function providerMainKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🔄 Switch Provider", callback_data: "prov_switch_menu" }],
      [{ text: "📊 Status", callback_data: "prov_status" }],
      [{ text: "⚙️ Task Routing", callback_data: "prov_routing_menu" }],
      [{ text: "🚀 Enable Provider", callback_data: "prov_enable_menu" }],
      [{ text: "⛔ Disable Provider", callback_data: "prov_disable_menu" }],
      [{ text: "⬅️ Back", callback_data: "own_panel" }],
    ],
  };
}

export function providerSwitchKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "OpenRouter", callback_data: "prov_set_openrouter" }],
      [{ text: "Hugging Face", callback_data: "prov_set_huggingface" }],
      [{ text: "🤖 Auto (Smart Mode)", callback_data: "prov_set_auto" }],
      [{ text: "⬅️ Back", callback_data: "prov_main" }],
    ],
  };
}

export function providerRoutingKeyboard(routing: Record<string, string>): TelegramBot.InlineKeyboardMarkup {
  const icon = (task: string) => {
    const p = routing[task] || "openrouter";
    return p === "openrouter" ? "🧠" : p === "huggingface" ? "🤗" : "🤖";
  };
  return {
    inline_keyboard: [
      [{ text: `${icon("text")} Text → ${routing.text || "openrouter"}`, callback_data: "prov_route_text" }],
      [{ text: `${icon("code")} Code → ${routing.code || "openrouter"}`, callback_data: "prov_route_code" }],
      [{ text: `${icon("image")} Image → ${routing.image || "huggingface"}`, callback_data: "prov_route_image" }],
      [{ text: `${icon("video")} Video → ${routing.video || "huggingface"}`, callback_data: "prov_route_video" }],
      [{ text: "🔄 Reset Defaults", callback_data: "prov_route_reset" }],
      [{ text: "⬅️ Back", callback_data: "prov_main" }],
    ],
  };
}

export function providerEnableKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ Enable OpenRouter", callback_data: "prov_enable_openrouter" }],
      [{ text: "✅ Enable Hugging Face", callback_data: "prov_enable_huggingface" }],
      [{ text: "⬅️ Back", callback_data: "prov_main" }],
    ],
  };
}

export function providerDisableKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⛔ Disable OpenRouter", callback_data: "prov_disable_openrouter" }],
      [{ text: "⛔ Disable Hugging Face", callback_data: "prov_disable_huggingface" }],
      [{ text: "⬅️ Back", callback_data: "prov_main" }],
    ],
  };
}

export function providerStatusKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🔄 Refresh", callback_data: "prov_status" }],
      [{ text: "⬅️ Back", callback_data: "prov_main" }],
    ],
  };
}

export function providerRoutePickKeyboard(task: string, current: string): TelegramBot.InlineKeyboardMarkup {
  const makeBtn = (label: string, val: string) => ({
    text: (current === val ? "✅ " : "") + label,
    callback_data: `prov_routeset_${task}_${val}`,
  });
  return {
    inline_keyboard: [
      [makeBtn("OpenRouter", "openrouter")],
      [makeBtn("Hugging Face", "huggingface")],
      [makeBtn("🤖 Auto", "auto")],
      [{ text: "⬅️ Back", callback_data: "prov_routing_menu" }],
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
