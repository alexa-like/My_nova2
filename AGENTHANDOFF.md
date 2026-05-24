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

## Next Tasks (suggested, not yet started)

- [ ] `/stats` command — show user their personal breakdown (messages, images, builds, streak, achievements) from MongoDB
- [ ] Achievements display in callback handler — the `achievements_menu` callback needs a proper handler using the new `getUserAchievements` from engagement.ts
- [ ] `whats_new_menu` callback — `whatsNewKeyboard` is in place; verify the handler uses `formatAnnouncements()` correctly
- [ ] MongoDB rate limiter cleanup job — the RateLimit model has a TTL index but confirm it fires correctly for your MongoDB version
- [ ] Telegram Stars payment — `sendStarsInvoice` is wired up but the actual invoice items/prices need to be defined in `payment.ts`
- [ ] Deploy to Render — set env secrets: `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`, `WEBHOOK_URL`
- [ ] `modeManager.ts` is now dead code (nothing imports it) — can be deleted in a future cleanup pass

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
