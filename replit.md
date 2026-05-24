# Nova AI Bot

A production-ready Telegram AI assistant with personality modes, group moderation, image generation, premium system, and owner dashboard.

## Agent Handoff

**Read `AGENTHANDOFF.md` at the project root before starting any work.** It contains the full session history, current build state, files changed, and the prioritised next-task list. Update it at the end of every session — add a new entry under Session History, update Current State, and adjust the Next Tasks checklist.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: MongoDB + Mongoose (user data, memory, premium, redeem codes, group settings)
- Bot: node-telegram-bot-api (polling mode)
- AI: OpenRouter (meta-llama/llama-3.3-70b-instruct, model swappable)
- Images: Hugging Face Inference API (FLUX Schnell / SDXL)
- Music: HuggingFace musicgen-small
- Video: HuggingFace text-to-video-ms-1.7b
- GitHub: REST API v3 — repo creation + file push for /build
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all bot logic
  - `models/` — Mongoose schemas: User, Memory, RedeemCode, GroupSettings, BotConfig, Reminder
  - `handlers/` — privateHandler, groupHandler, ownerHandler, callbackHandler
  - `services/` — ai.ts, image.ts, music.ts, video.ts, webSearch.ts, github.ts, projectGenerator.ts, reminder.ts, tts.ts, voice.ts
  - `middlewares/` — userMiddleware.ts (upsert + premium expiry)
  - `utils/` — rateLimiter.ts, helpers.ts, keyboards.ts, pendingActions.ts
- `artifacts/api-server/src/routes/bot.ts` — `/api/bot/status` endpoint
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Bot runs in polling mode (no webhook needed for Replit dev)
- MongoDB for all bot data; PostgreSQL/Drizzle kept for any future API features
- OpenRouter as AI backend — model can be swapped in `ai.ts`
- HuggingFace fallback: tries SDXL first, falls back to SD 1.5
- Context memory kept per (userId, chatId) pair — groups have separate memory per user
- Rate limiting is MongoDB-backed (RateLimit model with TTL index) — 20 msgs/min per user, survives restarts

## Product

Nova is a human-like Telegram AI assistant with:
- **Personality modes**: friendly, funny, serious, balanced
- **Private chat**: full AI chat, image generation, settings, premium/redeem
- **Group chat**: responds only when mentioned/replied to; full moderation suite
- **Owner dashboard**: user lookup, broadcast, premium management, stats, redeem codes
- **Premium system**: free (3 images/day) vs premium (20 images/day, better AI)
- **Memory**: per-conversation context stored in MongoDB (last 20 messages)

## User preferences

- Bot username: @Novabyolabot
- Set OWNER_ID secret to enable owner dashboard commands

## Gotchas

- `OWNER_ID` must be set as a secret for owner commands to work
- HuggingFace model may be loading (cold start) — image generation can take 30-60s on first call
- Polling mode: if multiple instances run, messages get split between them — keep one instance running
- Rate limit is now MongoDB-backed so it no longer resets on restart
- Webhook mode activates automatically if `WEBHOOK_URL` env var is set (needed for Render production)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
