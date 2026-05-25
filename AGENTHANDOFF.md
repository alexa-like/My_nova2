# Agent Handoff — Nova AI Bot

> This file is kept up to date after every session so any agent (or account switch) can immediately continue where work left off. Update the **Current State** and **Next Tasks** sections at the end of every session.

---

## Project Summary

Nova is a production Telegram AI assistant with personality modes, group moderation, image generation, a premium/credits system, and an owner dashboard. It runs on Node.js 24 + TypeScript + MongoDB + OpenRouter + HuggingFace. Deployed to Render; dev runs in Replit via polling mode.

**Bot username:** @Novabyolabot  
**Stack:** pnpm workspaces · Express 5 · MongoDB/Mongoose · node-telegram-bot-api · esbuild  
**Key workflow:** `pnpm --filter @workspace/api-server run dev` (port 8080 in prod, 5000 in dev)

---

## Session History

### Session 1 — Full Cleanup & Upgrade (completed)

**Goal given by user:** Remove dead code, add webhook mode, /deletedata, MongoDB rate limiter, startup env validation, admin feature stats, /feedback handler, bot-joined-group welcome.

**Tasks completed:**
- T001 — Deleted unused `plugins/` directory (registry.ts + types.ts)
- T002 — Rewrote `intentEngine.ts` with richer patterns; `detectTranslateIntent` now returns `{content, targetLang}`; removed ~130 lines of duplicate local intent functions from `privateHandler.ts`
- T003 — Added `/deletedata` two-step confirm command with 60s timeout
- T004 — Bot auto-switches to webhook mode when `WEBHOOK_URL` env var is set; added group-join welcome message
- T005 — Added `POST /api/bot/webhook` route in `app.ts`
- T006 — Startup env validation: production hard-aborts on missing `TELEGRAM_BOT_TOKEN`/`MONGODB_URI`; dev warns and continues
- T007 — MongoDB-backed `RateLimit` model (TTL index); rateLimiter persists/loads from DB while keeping sync API
- T008 — `GET /api/admin/analytics/features` endpoint: feature usage counts, active users, top-features leaderboard
- T009 — `feedback_pending` case in `handlePendingText`: saves feedback to user record, notifies owner
- T010 — Resolved all 5 cross-account git merge conflicts (engagement.ts, User.ts, keyboards.ts, callbackHandler.ts, privateHandler.ts); build passes clean

**Files changed in this session:**
- `artifacts/api-server/src/bot/services/engagement.ts` — full unified rewrite (merged both branches)
- `artifacts/api-server/src/bot/models/User.ts` — merged fields from both branches
- `artifacts/api-server/src/bot/utils/keyboards.ts` — merged all keyboard functions from both branches
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts` — merged imports, Stars payment, onboarding flow
- `artifacts/api-server/src/bot/handlers/privateHandler.ts` — /deletedata, feedback, deduped imports
- `artifacts/api-server/src/bot/services/intentEngine.ts` — full rewrite, richer patterns
- `artifacts/api-server/src/bot/models/RateLimit.ts` — new MongoDB TTL model
- `artifacts/api-server/src/bot/utils/rateLimiter.ts` — MongoDB-backed, sync API
- `artifacts/api-server/src/bot/utils/pendingActions.ts` — added `deletedata_confirm` type
- `artifacts/api-server/src/index.ts` — startup env validation (prod-only hard abort)
- `artifacts/api-server/src/app.ts` — webhook route
- `artifacts/api-server/src/bot/index.ts` — webhook mode + group-join welcome
- `artifacts/api-server/src/routes/admin.ts` — `/api/admin/analytics/features` endpoint

---

## Current State (as of end of Session 2)

- **Build:** ✅ Clean — `pnpm --filter @workspace/api-server run typecheck` passes with 0 errors
- **Bundle:** ✅ esbuild produces `dist/index.mjs`
- **Workflows:** All 4 running (`Start application`, `admin-dashboard: web`, `api-server: API Server`, `mockup-sandbox`)
- **Bot:** Starts cleanly, defaults to AI chat + auto-intent detection; no mode locking
- **Secrets needed to run the bot:** `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`

---

## Session 2 — Mode Removal + Builder Config + Deploy UX (completed)

**Goal given by user:** Remove ALL mode switching (Nova defaults to AI chat + auto-detect intent). Website builder uses 3 BotConfig-driven code models (owner switchable, addable). Deploy buttons always shown after build, tokens collected inline when missing. Tokens stored permanently, never deleted.

**Tasks completed:**
- T001 — Removed mode switching entirely: `/mode` command, mode routing switch block, `modes_menu`/`mode_set_*` callbacks, `🎯 Mode` button from main menu
- T002 — Replaced mode button with `🔊 Voice` (`tts_btn`) in both `mainMenuKeyboard` and `mainMenuWithNewsKeyboard`; removed `MODES`/`ModeDefinition` imports from keyboards.ts; removed `modeSelectKeyboard`/`currentModeKeyboard` functions
- T003 — All `mainMenuKeyboard(activeMode)` calls → `mainMenuKeyboard()` and all `mainMenuWithNewsKeyboard(activeMode, hasNews)` → `mainMenuWithNewsKeyboard(hasNews)` across all handlers
- T004 — `buildResultKeyboard` now always shows Vercel + Render deploy buttons (no conditional); deploy buttons always visible after every build
- T005 — `deploy_live`/`deploy_render` callbacks now collect token inline when missing (via `setPending`) instead of just showing a settings redirect
- T006 — After saving Vercel/Render token, shows "Deploy Now" button so user can immediately deploy
- T007 — Added `activeCodeModel`/`codeModels` to `IBotConfig` interface and `BotConfigSchema` with 3 defaults (Llama 3.3 70B, DeepSeek V4 Flash, Gemma 4 31B); backfill logic for existing configs
- T008 — `generateProject` in `projectGenerator.ts` now reads active code model from BotConfig (tries active first, then rest, then hardcoded fallbacks)
- T009 — Added `ownerCodeModelsKeyboard` to keyboards.ts and `💻 Code Model` button to owner panel keyboard
- T010 — Added `own_code_models`/`own_set_code_*`/`own_del_code_*`/`own_add_code` callbacks to callbackHandler.ts
- T011 — Added `owner_add_code_step1`/`owner_add_code_step2` pending handlers to ownerHandler.ts
- T012 — Added `owner_add_code_step1`/`owner_add_code_step2` to pendingActions.ts type union and OWNER_PENDING_ACTIONS set
- T013 — No-GitHub build path now always shows both Vercel + Render deploy buttons (removed `canDeploy` conditional)

**Files changed in this session:**
- `artifacts/api-server/src/bot/utils/keyboards.ts` — remove mode functions/button, add ownerCodeModelsKeyboard, update buildResultKeyboard, update both mainMenu keyboards
- `artifacts/api-server/src/bot/models/BotConfig.ts` — add activeCodeModel/codeModels to interface/schema/defaults/backfill
- `artifacts/api-server/src/bot/services/projectGenerator.ts` — BotConfig-driven code model chain
- `artifacts/api-server/src/bot/handlers/privateHandler.ts` — remove mode imports/command/routing, fix all mainMenuKeyboard calls, inline token save flow, always-show deploy path
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts` — remove mode callbacks/imports, add code model owner callbacks, inline token collect for deploy
- `artifacts/api-server/src/bot/handlers/ownerHandler.ts` — add owner_add_code_step1/step2 pending handlers
- `artifacts/api-server/src/bot/utils/pendingActions.ts` — add owner_add_code_step1/step2 types

---

---

## Session 3 — Inline Keyboard UX Fixes + Full Codebase Audit (completed)

**Goal:** Fix build menu UX (only showing Back button), back navigation inconsistencies, then full project audit.

**Keyboard/navigation fixes:**
- T001 — Removed duplicate `build_menu` handler (lines ~248-253) that blocked the real handler with all build options
- T002 — Build type prompt cancel: `⬅️ Back → build_menu` + `❌ Cancel → main_menu`
- T003 — `my_projects` empty state back button: changed from `settings_deployments` → `build_menu`
- T004 — `my_projects` list back row: changed from `settings_deployments` → `build_menu` with "🌐 Build Another" sibling
- T005 — After all projects deleted: back → `build_menu` instead of settings
- T006 — `show_help` callback: removed stale `/voice <text>` command reference

**Full audit fixes:**
- T007 — `index.ts`: Removed 2 unused groupGate imports (`getMandatoryGroups`, `sendLeftGroupDM`) — only `seedDefaultMandatoryGroup` is actually called
- T008 — `scripts/tsconfig.json`: Fixed `TS18003` typecheck error by replacing empty `"include": ["src"]` with `"files": []` (no TS sources in scripts package)
- T009 — `ai.ts`: Reduced per-model timeout from 25 000 ms → 12 000 ms; worst-case 7-model chain now ~84 s max (previously ~175 s, exceeding Telegram webhook timeout)
- T010 — `pendingActions.ts`: Removed dead `voice_tts_input` action type (TTS service deleted in previous session)
- T011 — `engagement.ts` `FEATURE_LABELS`: Removed duplicate `cb` property (identical to `callback`), removed dead `tts`/`stt` entries
- T012 — `engagement.ts` `checkAndGrantAchievements`: Removed `tts`/`stt` from typeMap (those features no longer exist)
- T013 — `utils/suggestions.ts`: Removed dead `tts`/`stt` suggestion entries; updated `translate` and `summarize` suggestions to use live features
- T014 — `services/suggestions.ts`: Removed dead `voice` context entry that pointed to `stt_btn`/`tts_btn`
- T015 — `keyboards.ts` `creditsMenuKeyboard`: Removed unused `_hasPayment` parameter; updated both call sites
- T016 — `keyboards.ts` `welcomeBackKeyboard`: Removed `tts`/`stt` entries from `FEATURE_BTNS` map
- T017 — `keyboards.ts` credits display: Removed "🔊 Voice" line from credits cost breakdown (feature gone)
- T018 — `privateHandler.ts`: Removed orphaned `ttsCost` variable; removed now-unused `hasAnyPaymentProvider` import
- T019 — `callbackHandler.ts`: Removed `hasAnyPaymentProvider` (now unused); improved `tts_btn`/`stt_btn` toast message to inform users the feature was removed
- T020 — `callbackHandler.ts` `my_projects` empty-state: Fixed duplicate "Build a Project" + "Back to Build" both pointing to `build_menu` (keeps layout clean)
- T021 — Full typecheck passes: 0 errors across all 4 packages (`api-server`, `admin-dashboard`, `mockup-sandbox`, `scripts`)

**Files changed this session:**
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts`
- `artifacts/api-server/src/bot/handlers/privateHandler.ts`
- `artifacts/api-server/src/bot/utils/keyboards.ts`
- `artifacts/api-server/src/bot/utils/suggestions.ts`
- `artifacts/api-server/src/bot/utils/pendingActions.ts`
- `artifacts/api-server/src/bot/services/ai.ts`
- `artifacts/api-server/src/bot/services/engagement.ts`
- `artifacts/api-server/src/bot/services/suggestions.ts`
- `artifacts/api-server/src/bot/index.ts`
- `scripts/tsconfig.json`

---

---

## Session 4 — Full Project Audit, Debug, Repair & Cleanup (completed)

**Goal:** Complete deep audit of all commands, callbacks, handlers, services, security, packages, and deployment — fix all bugs found.

**Bugs fixed:**

- **BUG-01 CRITICAL** — `build_pending` pending action had NO handler in privateHandler.ts; users who clicked a build type button then typed their description got "Something went wrong." Fixed: changed `setPending(userId, "build_pending")` → `setPending(userId, "build_input")` in callbackHandler.ts; removed dead `build_pending` type from pendingActions.ts.

- **BUG-02 CRITICAL** — `privacy_delete_data` callback had two handlers; the second (line 3111) was dead code and referenced a non-existent `/deleteaccount` command. The first (line 353) had wrong instructions ("send `/deletedata confirm`" but command expects text "DELETE MY DATA"). Fixed: first handler now directly calls `setPending(userId, "deletedata_confirm")` with correct confirmation instructions; second dead handler removed.

- **BUG-03** — `answer()` helper function in callbackHandler.ts only accepted 3 args but was called with 4 (`true` for `show_alert`) in promo_claim flow (lines 3002, 3004, 3008), causing TypeScript errors TS2554. Fixed: added optional `showAlert?: boolean` parameter.

- **BUG-04** — Duplicate `/daily` handler in privateHandler.ts (lines 500–524): old 20-hour cooldown version that directly added credits and bypassed the daily_claim callback flow. Removed; kept the correct version at line 1064 (24h, streak-aware, uses dailyRewardKeyboard).

- **BUG-05** — Duplicate `/achievements` handler (lines 527–535): used broken `Object.keys(ACHIEVEMENTS)` (array → returns indices) and stale `formatAchievementsText`. Removed; kept the correct version at line 334.

- **BUG-06** — Duplicate `/privacy` handler (lines 538–555): stale Markdown version that mentioned "voice messages (discarded after transcription)" — a removed feature. Removed; kept the correct version at line 315 with proper privacyMenuKeyboard().

- **BUG-07** — Second `/refer` handler (line 1092) was dead code for `/refer` (596 fires first) but handled `/referral` and `/invite` aliases. Fixed: changed condition to `/referral || /invite` only so both handlers are reachable.

- **BUG-08** — `first_voice` achievement in engagement.ts could never be earned (TTS removed) and `case "voice": award("first_voice")` would award a non-existent achievement. Removed both the achievement definition and the award call.

- **CLEANUP-01** — Stale `/deploy` command references cleaned across 4 files: groupHandler redirect message, ownerHandler status panel, callbackHandler onboarding step 3 text, announcements.ts build_deploy entry — all updated to reference `/build` + Deploy button flow.

- **CLEANUP-02** — `@Nova /voice <text>` removed from group `/help` command output (TTS removed).

- **CLEANUP-03** — `• 🔊 Long Text TTS` removed from `/updates` command text.

- **CLEANUP-04** — Unused imports removed from privateHandler.ts: `privacyKeyboard` (from keyboards.ts) and `formatAchievementsText` (from engagement.ts) — both only used in removed duplicate handlers.

- **CLEANUP-05** — Unused packages removed from package.json: `msedge-tts` (TTS removed) and `cookie-parser` + `@types/cookie-parser` (never imported anywhere in the codebase).

**Final state:** TypeScript checks clean for all bot code. Zero orphaned keyboard buttons. Zero stale /deploy command references. All pending action types have matching handlers.

**Files changed this session:**
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts` — answer() signature, build_pending→build_input, privacy_delete_data fix, remove dead duplicate, /deploy onboarding text
- `artifacts/api-server/src/bot/handlers/privateHandler.ts` — remove 3 duplicate handlers (/daily, /achievements, /privacy), fix /refer aliases, remove TTS from /updates, clean imports
- `artifacts/api-server/src/bot/handlers/groupHandler.ts` — remove /voice from help, fix /deploy redirect
- `artifacts/api-server/src/bot/handlers/ownerHandler.ts` — fix Vercel /deploy reference
- `artifacts/api-server/src/bot/utils/pendingActions.ts` — remove dead build_pending type
- `artifacts/api-server/src/bot/services/engagement.ts` — remove first_voice achievement + award case
- `artifacts/api-server/src/bot/services/announcements.ts` — update build_deploy entry
- `artifacts/api-server/package.json` — remove msedge-tts, cookie-parser, @types/cookie-parser

---

## Next Tasks (suggested, not yet started)

- [ ] Captcha store is in-memory — if server restarts mid-captcha, users get stuck muted; consider persisting captcha state to MongoDB
- [ ] Admin dashboard chunk size is 647 KB (warn threshold 500 KB) — consider lazy-loading heavy routes to improve load time
- [ ] Deploy to Render — set env secrets: `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`, `WEBHOOK_URL`

---

## Key Files Quick Reference

| What | Where |
|---|---|
| All bot logic entry | `artifacts/api-server/src/bot/index.ts` |
| Private chat handler | `artifacts/api-server/src/bot/handlers/privateHandler.ts` |
| Callback query handler | `artifacts/api-server/src/bot/handlers/callbackHandler.ts` |
| Group handler | `artifacts/api-server/src/bot/handlers/groupHandler.ts` |
| Owner commands | `artifacts/api-server/src/bot/handlers/ownerHandler.ts` |
| AI service | `artifacts/api-server/src/bot/services/ai.ts` |
| Image service | `artifacts/api-server/src/bot/services/image.ts` |
| Engagement/achievements | `artifacts/api-server/src/bot/services/engagement.ts` |
| Intent detection | `artifacts/api-server/src/bot/services/intentEngine.ts` |
| All keyboards | `artifacts/api-server/src/bot/utils/keyboards.ts` |
| User model | `artifacts/api-server/src/bot/models/User.ts` |
| Rate limiter | `artifacts/api-server/src/bot/utils/rateLimiter.ts` |
| Server entry + env validation | `artifacts/api-server/src/index.ts` |
| Admin API routes | `artifacts/api-server/src/routes/admin.ts` |
