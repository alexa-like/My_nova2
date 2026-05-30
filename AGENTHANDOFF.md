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
- T010 — Resolved all 5 cross-account git merge conflicts; build passes clean

**Files changed in this session:**
- `artifacts/api-server/src/bot/services/engagement.ts`
- `artifacts/api-server/src/bot/models/User.ts`
- `artifacts/api-server/src/bot/utils/keyboards.ts`
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts`
- `artifacts/api-server/src/bot/handlers/privateHandler.ts`
- `artifacts/api-server/src/bot/services/intentEngine.ts`
- `artifacts/api-server/src/bot/models/RateLimit.ts`
- `artifacts/api-server/src/bot/utils/rateLimiter.ts`
- `artifacts/api-server/src/bot/utils/pendingActions.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/bot/index.ts`
- `artifacts/api-server/src/routes/admin.ts`

---

### Session 2 — Mode Removal + Builder Config + Deploy UX (completed)

**Goal given by user:** Remove ALL mode switching (Nova defaults to AI chat + auto-detect intent). Website builder uses 3 BotConfig-driven code models. Deploy buttons always shown after build, tokens collected inline when missing.

**Tasks completed:** (T001–T013 — see previous AGENTHANDOFF for details)

---

### Session 3 — Inline Keyboard UX Fixes + Full Codebase Audit (completed)

**Goal:** Fix build menu UX, back navigation inconsistencies, then full project audit.

**Tasks completed:** (T001–T021 — see previous AGENTHANDOFF for details)

---

### Session 4 — Full Project Audit, Debug, Repair & Cleanup (completed)

**Goal:** Deep audit — all commands, callbacks, handlers, services, security, packages, deployment.

**Tasks completed:** (BUG-01 through CLEANUP-05 — see previous AGENTHANDOFF for details)

---

### Session 5 — Full Project Audit, Debug, Repair, Security Hardening (completed)

**Goal:** Second deep-pass audit covering dead imports, handler consistency, group settings, admin route security, ObjectId injection, callback field injection.

**Fixes:** DEAD-01–03, SEC-01–03 — see previous AGENTHANDOFF for details.

---

### Session 6 — AI Markdown Code Blocks + Reply Keyboard Migration (completed)

**Goal:** (1) AI responses use proper Markdown code blocks (triple backticks + language hints). (2) Replace ALL inline keyboards with reply keyboards in private chats (exceptions: group settings, Telegram payment invoices, URL buttons).

**Tasks completed:**

- **AI Markdown** — `ai.ts`: Added `CODE FORMATTING` instruction to `buildSystemPrompt` requiring triple-backtick code blocks with language hints. `sendAIReply` in `privateHandler.ts` now tries `parse_mode: "Markdown"` before falling back to plain text.

- **games.ts** — Created `artifacts/api-server/src/bot/data/games.ts` with shared TRIVIA (20 questions) and WYR (25 questions) arrays exported for use in both handlers.

- **pendingActions.ts** — Added `"trivia_answer"` and `"wyr_answer"` to `PendingTextAction` union type.

- **keyboards.ts** — Appended ~30 new reply keyboard functions: `chatMenuReplyKeyboard`, `writeMenuReplyKeyboard`, `createMenuReplyKeyboard`, `imgStyleReplyKeyboard`, `buildSubMenuReplyKeyboard`, `buildResultMenuReplyKeyboard`, `funSubMenuReplyKeyboard`, `gamesSubMenuReplyKeyboard`, `triviaOptionsReplyKeyboard`, `wyrOptionsReplyKeyboard`, `settingsReplyKeyboard`, `aiStyleReplyKeyboard`, `replyLengthReplyKeyboard`, `langMenuReplyKeyboard`, `moodReplyKeyboard`, `creditsReplyKeyboard`, `accountReplyKeyboard`, `dailyMenuReplyKeyboard`, `achievementsMenuReplyKeyboard`, `privacyReplyKeyboard`, `deploymentsMenuReplyKeyboard`, `githubMenuReplyKeyboard`, `remindersMenuReplyKeyboard`, `ownerMainReplyKeyboard`, `ownerUsersReplyKeyboard`, `ownerPremiumReplyKeyboard`, `ownerCodesReplyKeyboard`, `ownerBroadcastReplyKeyboard`, `ownerGroupsReplyKeyboard`, `ownerFeaturesMenuReplyKeyboard`.

- **privateHandler.ts** — Complete routing block rewrite:
  - `REPLY_KEYBOARD_TEXTS` expanded to ~100+ button texts with `normalizeReplyText()` helper (strips `✅ ` prefix for style/lang/mood buttons)
  - Full sub-menu routing: chat, write, create, image styles, build, build deploy, fun, games, settings, AI style, reply length, language, mood, GitHub, deployments, privacy, credits/star packs
  - Trivia/WYR early-capture block at the top of `handlePrivateMessage` (before pending clear) — trivia checks answer against `pendingData.correctText`; WYR checks against `pendingData.optionA/B`
  - `handleOwnerReplyButton(bot, chatId, user, text)` function added — handles all owner reply keyboard buttons (stats, user management, premium, codes, broadcast, groups, features, model info, maintenance toggle, premium emoji toggle)
  - `img_generate_text` pending handler updated to use `stylePrefix` from pending data (instead of old `preset` key)
  - `sendAIReply` updated with Markdown fallback chain

- **callbackHandler.ts** — 
  - Replaced inline TRIVIA/WYR arrays with `import { TRIVIA, WYR } from "../data/games.js"`
  - Navigation callbacks (`main_menu`, `fun_menu`, `games_menu`, `ai_menu`, `img_menu`, `build_menu`, `settings_menu`) now send a new message with the appropriate reply keyboard instead of editing the old message with inline buttons
  - Added reply keyboard imports (`mainMenuReplyKeyboard`, `funSubMenuReplyKeyboard`, `gamesSubMenuReplyKeyboard`, `chatMenuReplyKeyboard`, `createMenuReplyKeyboard`, `buildSubMenuReplyKeyboard`, `settingsReplyKeyboard`)
  - Removed duplicate `build_menu` inline handler (now handled by navigation section)

**TypeScript:** 0 errors after all fixes. Build passes clean.

**Files changed this session:**
- `artifacts/api-server/src/bot/services/ai.ts`
- `artifacts/api-server/src/bot/utils/pendingActions.ts`
- `artifacts/api-server/src/bot/utils/keyboards.ts`
- `artifacts/api-server/src/bot/data/games.ts` (new file)
- `artifacts/api-server/src/bot/handlers/privateHandler.ts`
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts`

---

### Session 7 — Length Removal + Daily Rewards Overhaul + Owner Keyboard (completed)

**Goal:** (1) Remove text-length preference entirely. (2) Owner-only reply keyboard guard. (3) Daily rewards overhaul: auto-gift 3 free images at midnight WAT, spin always gives something, won rewards expire in 24 h with 11:59 PM warning, free gifts consumed before credits, profile shows active gift.

**Tasks completed:**

- **Length removal (full):**
  - `User.ts` — `settings.length` field removed from schema and interface
  - `GroupSettings.ts` — `length` field removed from schema and interface
  - `ai.ts` — `length` param removed from `buildSystemPrompt` and `chat()`; `maxTokens` fixed at 800; length instruction removed from prompt
  - `keyboards.ts` — `lengthMenuKeyboard`, `replyLengthReplyKeyboard` removed; "📏 Reply Length" removed from `settingsMenuKeyboard` and `settingsReplyKeyboard`; `groupSettingsKeyboard` type updated (removed `length` field)
  - `callbackHandler.ts` — `lengthMenuKeyboard` import removed; `settings_length / _short / _long` handlers removed; `"length"` removed from `ALLOWED_TOGGLE_FIELDS`; all `length:` params removed from every `chat()` call; stale `settings.length` display text removed from all profile/settings strings
  - `privateHandler.ts` — `replyLengthReplyKeyboard` import removed; `"📏 Reply Length"` and `"📌 Short Replies" / "📖 Long Replies"` removed from `REPLY_KEYBOARD_TEXTS`; reply-length routing blocks removed; `/length` command removed; all `length:` params removed from `chat()` calls; `settings.length` display removed from `/profile` and `/settings` strings
  - `groupHandler.ts` — all `length:` params removed from `chat()` calls
  - `inlineHandler.ts` — all `length:` params removed from `chat()` calls

- **Daily spin always gives something:**
  - Old "Common" no-reward tier replaced with `user.credits += 5` + message "🎉 You won: +5 credits!"
  - All reward messages now start with "🎉 You won: …" for consistency

- **Daily gift system:**
  - `User.ts` — `dailyGift` subdocument added: `{ label, type, amount, remaining, command, expiresAt, warned, expired, giftDate }`
  - `watTime.ts` — `msUntilNextMidnightWAT()`, `nextMidnightWATDate()`, `msUntilWATTime(h, m)` exported
  - `handleImageGeneration` (privateHandler.ts) — checks `user.dailyGift` first (type=image, not expired, remaining>0) and decrements it before falling back to credit deduction
  - `/profile` text — appended "── Daily Gift ──" section showing label, remaining count, and command when a valid gift is active
  - `index.ts` — `scheduleDailyReport` now fires at WAT midnight (was UTC midnight); added `scheduleAutoGifts` (runs at midnight WAT: expire stale gifts → gift all users 3 free images → notify each user); added `scheduleGiftExpiryWarnings` (runs at 23:59 WAT: notifies users with remaining gift, marks warned=true)

- **TypeScript:** 0 errors — `pnpm run typecheck` passes clean across all 4 packages after all changes.

**Files changed this session:**
- `artifacts/api-server/src/bot/models/User.ts`
- `artifacts/api-server/src/bot/models/GroupSettings.ts`
- `artifacts/api-server/src/bot/services/ai.ts`
- `artifacts/api-server/src/bot/utils/keyboards.ts`
- `artifacts/api-server/src/bot/utils/watTime.ts`
- `artifacts/api-server/src/bot/handlers/callbackHandler.ts`
- `artifacts/api-server/src/bot/handlers/privateHandler.ts`
- `artifacts/api-server/src/bot/handlers/groupHandler.ts`
- `artifacts/api-server/src/bot/handlers/inlineHandler.ts`
- `artifacts/api-server/src/bot/index.ts`

---

## Current State (as of end of Session 7)

- **Build:** ✅ Clean — `pnpm run typecheck` passes with 0 errors across all 4 packages
- **Workflow:** `Start application` running
- **Bot:** Starts cleanly; WAT-midnight schedulers armed on startup
- **Secrets needed to run the bot:** `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`

---

## Next Tasks (suggested, not yet started)

- [ ] Test the reply keyboard flow end-to-end with real Telegram account (ensure all ~100 button texts route correctly)
- [ ] Verify owner keyboard guard: `handleOwnerReplyButton` is only reachable inside the `isOwner` guard in `privateHandler.ts` — spot-check that non-owners can never see or trigger owner keyboard buttons
- [ ] Some callbacks still send inline keyboards for non-navigation flows (fun_joke, fun_iq, fun_compliment, etc.) — consider converting those result messages to use reply keyboards too
- [ ] Captcha store is in-memory — if server restarts mid-captcha, users get stuck muted; consider persisting captcha state to MongoDB
- [ ] Admin dashboard chunk size is 647 KB (warn threshold 500 KB) — consider lazy-loading heavy routes
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
| Shared game data | `artifacts/api-server/src/bot/data/games.ts` |
| User model | `artifacts/api-server/src/bot/models/User.ts` |
| Rate limiter | `artifacts/api-server/src/bot/utils/rateLimiter.ts` |
| Server entry + env validation | `artifacts/api-server/src/index.ts` |
| Admin API routes | `artifacts/api-server/src/routes/admin.ts` |
