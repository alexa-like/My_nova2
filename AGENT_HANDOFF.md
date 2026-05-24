# Nova Bot — Agent Handoff

> Read this entire file before touching any code. It contains everything needed to continue the work.

---

## Project Overview

Nova is a production Telegram AI bot deployed on **Render** (not Replit's deploy). The codebase is a pnpm monorepo:

- `artifacts/api-server/` — Express server + Telegram bot (the main product)
- `artifacts/admin-dashboard/` — React/Vite admin panel
- `artifacts/mockup-sandbox/` — UI prototyping server (dev tool only)

**Bot username:** @Novabyolabot  
**Required env vars (set as Render env vars):** `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `OPENROUTER_API_KEY`, `OWNER_ID`  
**Optional:** `HUGGINGFACE_API_KEY`, `GITHUB_TOKEN`, `GITHUB_USERNAME`, `VERCEL_TOKEN`

---

## How to Run

```bash
pnpm install                                      # install all deps
pnpm --filter @workspace/api-server run dev       # start bot (port 8080)
pnpm run build                                    # full typecheck + build (must be clean before pushing)
pnpm --filter @workspace/db run push              # push DB schema (if drizzle is used)
```

---

## What Was Completed (do NOT redo this)

### Session 1 — Core fixes
- Fixed TTS for long text: StreamElements now chunks at ≤240 chars, generates per chunk, concatenates into one audio file (`services/tts.ts`)
- Fixed `/build` model chain: now uses 4-model fallback (llama-3.3-70b → qwen-2.5-72b → gemma-3-27b → mistral-7b), error messages include per-model failure details (`services/projectGenerator.ts`)

### Session 2 — Full UX upgrade (ALL COMPLETE, build is clean ✅)
- **User model** extended with: `recentFeatures`, `achievements`, `onboardingComplete`, `loginStreak`, `lastActiveDate` (`models/User.ts`)
- **`services/engagement.ts`** (new file): 13-badge achievement system, `updateRecentFeatures`, `updateLoginStreak`, `checkAndGrantAchievements`, `formatAchievementsText`, `formatAchievementToast`, `FEATURE_LABELS`
- **`utils/suggestions.ts`** (new file): `contextSuggestionsKeyboard(featureKey)` and `mergeSuggestions(base, featureKey)` for smart next-step buttons
- **`utils/keyboards.ts`** — Added: `onboardingWelcomeKeyboard`, `onboardingStyleKeyboard`, `onboardingDoneKeyboard`, `welcomeBackKeyboard`, `achievementsKeyboard`, `privacyKeyboard`, `updatesKeyboard`, `buildMenuKeyboard`
- **`handlers/privateHandler.ts`** — New `/start` with interactive onboarding (new users) + personalised welcome-back with streak + recent feature shortcuts; added `/achievements`, `/privacy`, `/updates` commands; chat + TTS feature tracking with achievement toasts
- **`handlers/callbackHandler.ts`** — Added handlers for: `onboard_tour`, `onboard_style_*`, `onboard_skip`, `achievements_menu`, `privacy_info`, `privacy_delete_data`, `updates_menu`, `build_menu`, `build_website/react/dashboard/landing/custom`, `feedback_btn`
- **`services/analytics.ts`** — Added: `getFeatureStats(days)`, `getErrorRate(days)`, `trackFeature(userId, feature)`, `trackError(userId, context, error)`
- **`models/Analytics.ts`** — Added `"feature"` to `AnalyticsEvent` type + schema enum
- **`utils/pendingActions.ts`** — Added `"build_pending"` and `"feedback_pending"` to `PendingTextAction`
- **Pre-existing bug fixes:** `creditRewards.dailyReward` → `creditRewards.daily`; removed invalid 4th arg from all `answer()` calls in callbackHandler

---

## Git Situation

The repo has **two diverged branches**:

| Branch | What it has |
|---|---|
| `local main` (this code) | All Session 1 + Session 2 work above |
| `origin/main` (2nd Replit account) | Telegram Stars payments, Render deploy config, website builder model updates |

**A merge task was created (Task #1)** to safely combine both branches. It may or may not have completed. When you set up on the new account:

1. Run `git --no-optional-locks log --oneline -10` to see where things stand
2. Run `git --no-optional-locks status` to see if there are conflicts
3. If the merge hasn't happened yet, run `git fetch origin && git merge origin/main --no-edit`
4. Resolve any conflicts by keeping BOTH sides' changes (the local work and the remote work)
5. Run `pnpm run build` — must be clean before deploying

---

## What Needs to Be Done Next (priority order)

### 🔴 HIGH PRIORITY

#### 1. Switch from Polling to Webhook mode
**Why:** Polling is inefficient on Render (a real server with a public URL). Webhook is faster, uses less CPU, and more reliable.  
**Files to change:** `artifacts/api-server/src/bot/index.ts`, `artifacts/api-server/src/app.ts`  
**How:**
- Remove `bot.startPolling()`
- Add `bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`)` on startup
- Add Express route `POST /bot<TOKEN>` that calls `bot.processUpdate(req.body)`
- Add env var `RENDER_EXTERNAL_URL` in Render dashboard (it's the `.onrender.com` URL)
- Set `{ polling: false }` in bot constructor options

#### 2. Implement `/deletedata confirm` command
**Why:** The `/privacy` command tells users they can delete their data with `/deletedata confirm` — but this command doesn't exist. That's a broken promise.  
**File:** `artifacts/api-server/src/bot/handlers/privateHandler.ts`  
**How:** Add a handler for `text === "/deletedata confirm"` that:
- Deletes the user's `Memory` documents
- Resets their `User` document fields (settings, usage, projects, credits reset to 0, achievements cleared, premium cleared)
- Sends confirmation message
- Does NOT delete the User record entirely (keeps userId to prevent re-onboarding issues)

#### 3. Fix rate limiter to survive restarts
**Why:** Current `rateLimiter.ts` is in-memory — resets on every Render deploy, letting users spam the bot.  
**File:** `artifacts/api-server/src/bot/utils/rateLimiter.ts`  
**How:** Store rate limit hits in MongoDB with a TTL index (auto-expire after 60 seconds). Simple collection with `{ userId, count, windowStart }`.

#### 4. Startup environment validation
**Why:** If `TELEGRAM_BOT_TOKEN` or `MONGODB_URI` is missing, the bot crashes with a confusing error.  
**File:** `artifacts/api-server/src/index.ts`  
**How:** At the top of the startup function, check each required env var and throw a clear error message if missing.

### 🟡 MEDIUM PRIORITY

#### 5. Global polling/webhook error recovery
**Why:** An unhandled error in the bot event loop silently stops the bot from responding.  
**File:** `artifacts/api-server/src/bot/index.ts`  
**How:** Wrap the bot's `on('message', ...)` and `on('callback_query', ...)` handlers in try/catch. Also add `process.on('unhandledRejection', ...)` to log instead of crash.

#### 6. Fix reminders surviving Render restarts
**Why:** Reminders use `setTimeout` which dies on restart. Any reminder > a few hours away is silently lost.  
**File:** `artifacts/api-server/src/bot/services/reminder.ts`  
**How:** On bot startup, query all `Reminder` documents where `triggerAt > now` and re-schedule them with `setTimeout`. Already partially implemented — needs to be called from startup.

#### 7. Remove unused plugin files
**Why:** Dead code that confuses anyone reading the project.  
**Files to delete:**
- `artifacts/api-server/src/bot/plugins/registry.ts`
- `artifacts/api-server/src/bot/plugins/types.ts`
- Remove the `plugins/` directory entirely
- Check `index.ts` or `app.ts` for any imports of these files and remove them

#### 8. Deduplicate intent detection
**Why:** `intentEngine.ts` and `privateHandler.ts` both have intent detection logic. They can contradict each other.  
**Files:** `services/intentEngine.ts`, `handlers/privateHandler.ts`  
**How:** Remove the local regex patterns in `privateHandler.ts` (search for `detectImageIntent`, `detectBuildIntent`, similar) and route all intent detection through `intentEngine.ts`.

#### 9. Wire up `/feedback` command
**Why:** The `Feedback` model exists in MongoDB and the button exists in the UI, but the command and pending handler aren't connected.  
**Files:** `handlers/privateHandler.ts`, `models/Feedback.ts`  
**How:**
- Add `/feedback` command handler → sets pending `"feedback_pending"` state
- In `handlePendingText`, add case `"feedback_pending"` → saves to `Feedback` model with `{ userId, text: input, createdAt: now }` → confirms to user

### 🟢 LOW PRIORITY

#### 10. Admin dashboard: show feature analytics
**Why:** `getFeatureStats()` and `getErrorRate()` are implemented in `analytics.ts` but the dashboard doesn't display them.  
**Files:** `artifacts/admin-dashboard/src/`, `artifacts/api-server/src/routes/admin.ts`  
**How:** Add a `/api/admin/feature-stats` endpoint that returns `getFeatureStats(7)` and `getErrorRate(1)`. Add a simple stats card in the dashboard.

#### 11. Group welcome message
**Why:** When Nova is added to a group, it doesn't introduce itself.  
**File:** `handlers/groupHandler.ts`  
**How:** Add a `on('new_chat_members', ...)` handler. If the new member is the bot itself, send a welcome/setup message.

---

## Key Architecture Facts (read before editing)

- Bot runs in **polling mode** on dev, should be switched to **webhook** for production Render
- All bot data is in **MongoDB** (via Mongoose). The PostgreSQL/Drizzle setup in the repo is unused by the bot
- AI goes through **OpenRouter** (`services/ai.ts`) — model is configurable from the owner dashboard
- Images use **HuggingFace** with Pollinations.ai as fallback (`services/image.ts`)
- Context memory is per `(userId, chatId)` pair, stored in `Memory` model, last 20 messages
- Rate limiting is currently **in-memory** (needs fixing — see #3 above)
- The `BotConfig` model in MongoDB stores all owner-configurable settings (models, limits, features, etc.)
- Credits system: free users get 50 starting credits; premium users skip credit checks; costs are in `BotConfig.creditCosts`
- `OWNER_ID` env var grants full admin access to that Telegram user ID

---

## Files You'll Touch the Most

```
artifacts/api-server/src/bot/handlers/privateHandler.ts   — main message routing (~2800 lines)
artifacts/api-server/src/bot/handlers/callbackHandler.ts  — all button callbacks (~2860 lines)
artifacts/api-server/src/bot/handlers/groupHandler.ts     — group chat logic (~1540 lines)
artifacts/api-server/src/bot/services/ai.ts               — OpenRouter AI calls
artifacts/api-server/src/bot/services/engagement.ts       — achievements + streaks
artifacts/api-server/src/bot/utils/keyboards.ts           — all inline keyboards
artifacts/api-server/src/bot/models/User.ts               — user schema
artifacts/api-server/src/bot/index.ts                     — bot startup + event binding
```

---

## Build Must Always Be Clean

Before pushing to Render or committing, run:
```bash
pnpm run build
```
It must exit with code 0 and no TypeScript errors. The last verified clean build was after Session 2.
