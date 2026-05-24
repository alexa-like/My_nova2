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

## Current State (as of end of Session 1)

- **Build:** ✅ Clean — `pnpm --filter @workspace/api-server run typecheck` passes with 0 errors
- **Bundle:** ✅ esbuild produces `dist/index.mjs` (8.1 MB)
- **Workflows:** All 4 running (`Start application`, `admin-dashboard: web`, `api-server: API Server`, `mockup-sandbox`)
- **Git conflicts:** ✅ All resolved — no merge conflict markers remain
- **Bot:** Starts cleanly in dev (warns about missing env vars, continues); production validates and hard-aborts if `TELEGRAM_BOT_TOKEN` or `MONGODB_URI` missing
- **Secrets needed to run the bot:** `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY` (optional but needed for AI), `OWNER_ID` (for owner dashboard)

---

## Next Tasks (suggested, not yet started)

- [ ] `/stats` command — show user their personal breakdown (messages, images, builds, streak, achievements) from MongoDB
- [ ] Achievements display in callback handler — the `achievements_menu` callback needs a proper handler using the new `getUserAchievements` from engagement.ts
- [ ] Onboarding step callbacks — `onboard_step_1/2/3/4` callbacks are referenced by the new keyboards but the handler cases are not yet wired up in callbackHandler.ts
- [ ] `privacy_menu` callback — now has a dedicated `privacyMenuKeyboard` but check the handler sends the right message
- [ ] `whats_new_menu` callback — `whatsNewKeyboard` is in place; verify the handler uses `formatAnnouncements()` correctly
- [ ] MongoDB rate limiter cleanup job — the RateLimit model has a TTL index but confirm it fires correctly for your MongoDB version
- [ ] Telegram Stars payment — `sendStarsInvoice` is wired up but the actual invoice items/prices need to be defined in `payment.ts`
- [ ] Deploy to Render — set env secrets there: `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`, `WEBHOOK_URL` (to `https://<your-render-app>.onrender.com`)

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
