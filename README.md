# Nova AI Bot 🤖💖

A production-ready Telegram AI assistant with human-like personality, group moderation, image generation, premium system, owner dashboard, and optional web admin panel.

---

## Features

- **AI Chat** — Human-like conversations powered by OpenRouter (Llama 3.3 70B)
- **Image Generation** — Stable Diffusion 3 via HuggingFace (8 style presets)
- **Personality Modes** — friendly, funny, serious, balanced
- **Conversation Memory** — Remembers context (last 20 messages per user)
- **Group Moderation** — ban, mute, warn, kick, pin, purge, promote, demote, anti-spam
- **Premium System** — Free vs Premium tiers with redeem codes
- **Owner Dashboard** — Full control panel via private Telegram chat
- **Welcome Messages** — Auto-greet new group members
- **Always Online** — Self-ping keep-alive + polling auto-restart with exponential backoff
- **Analytics** — Track messages, commands, image generations, errors per user/day
- **Web Admin Dashboard** — Optional React dashboard (deployable to Vercel)

---

## Deploy to Render (One-Click)

### Step 1 — Push to GitHub

1. Go to [github.com](https://github.com) and create a new **private** repository
2. In Replit, open the Shell tab and run:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### Step 2 — Connect to Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select your repository
4. Render will automatically detect `render.yaml` and configure everything
5. Click **Apply**

### Step 3 — Set Environment Variables

After the service is created, go to your service → **Environment** tab and add:

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `TELEGRAM_BOT_TOKEN` | Your bot token | [@BotFather](https://t.me/BotFather) on Telegram |
| `MONGODB_URI` | `mongodb+srv://...` | [MongoDB Atlas](https://cloud.mongodb.com) — free tier |
| `OPENROUTER_API_KEY` | Your API key | [openrouter.ai](https://openrouter.ai) |
| `HUGGINGFACE_API_TOKEN` | Your token | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| `OWNER_ID` | Your Telegram user ID | Message [@userinfobot](https://t.me/userinfobot) |
| `SESSION_SECRET` | Any random string | Generate at [randomkeygen.com](https://randomkeygen.com) |
| `SERVER_URL` | `https://your-service.onrender.com` | Your Render service URL (enables built-in keep-alive) |
| `ADMIN_API_KEY` | Any secret string | Your choice — used to authenticate the web dashboard |

### Step 4 — Built-in Keep-Alive

Nova includes a **self-ping system** that automatically pings `/api/healthz` every 5 minutes to prevent Render's free tier from sleeping. Set `SERVER_URL` to your Render URL to enable it.

For extra reliability, you can also use [UptimeRobot](https://uptimerobot.com):
1. New Monitor → HTTP(s)
2. URL: `https://your-service.onrender.com/api/healthz`
3. Interval: 5 minutes

---

## Web Admin Dashboard (Optional)

The admin dashboard is a separate React app you can deploy to Vercel. It connects to your bot's API.

### Step 1 — Deploy to Vercel

1. In your GitHub repo, the dashboard is at `artifacts/admin-dashboard/`
2. Go to [vercel.com](https://vercel.com) and import your repo
3. Set the **Root Directory** to `artifacts/admin-dashboard`
4. Set these environment variables in Vercel:
   - `BASE_PATH` = `/` (or your preferred path)
5. Deploy

### Step 2 — Connect the Dashboard

1. Open the deployed dashboard URL
2. Enter your **Backend URL** (e.g. `https://your-bot.onrender.com`)
3. Enter your **ADMIN_API_KEY** (must match the env var on Render)
4. Click Connect

### Dashboard Features

- **Overview** — Bot status, user counts, usage stats
- **Users** — Browse, search, ban/unban, grant/revoke premium, clear memory
- **Broadcast** — Send messages to all users (or premium only)
- **Codes** — Create and manage premium redeem codes
- **Analytics** — Daily event charts, top commands
- **Logs** — Live activity event stream

---

## MongoDB Atlas Setup (Free)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and sign up
2. Create a **free** M0 cluster (512MB — enough for thousands of users)
3. Click **Connect** → **Drivers** → copy the connection string
4. Replace `<password>` with your database user password
5. Add `/nova` at the end: `mongodb+srv://user:pass@cluster.mongodb.net/nova`
6. In **Network Access**, click **Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0)

---

## Local Development

```bash
# Install dependencies
pnpm install

# Set environment variables (copy and fill in values)
cp .env.example .env

# Start the bot
pnpm --filter @workspace/api-server run dev

# Start the admin dashboard (separate terminal)
pnpm --filter @workspace/admin-dashboard run dev
```

---

## Bot Commands

### Private Chat

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show all commands |
| `/image <prompt>` | Generate an image |
| `/image <prompt> --style <preset>` | Generate with style preset |
| `/profile` | View your profile & stats |
| `/settings` | View current settings |
| `/premium` | Check premium status |
| `/redeem <code>` | Redeem a premium code |
| `/forget` | Clear conversation memory |
| `/style friendly\|funny\|serious\|balanced` | Change personality |
| `/length long\|short` | Change reply length |
| `/emoji on\|off` | Toggle emojis |

### Image Style Presets

Use `--style <preset>` with `/image` (or select from the style menu):

| Preset | Description |
|--------|-------------|
| `anime` | Anime / Studio Ghibli style |
| `realistic` | Photorealistic, 8K |
| `oil` | Oil painting, impressionist |
| `watercolor` | Soft watercolor art |
| `cyberpunk` | Neon lights, futuristic |
| `fantasy` | Magical fantasy art |
| `sketch` | Pencil sketch, line art |
| `pixel` | Pixel art, retro game |

### Group Chat (Admin Only)

Add Nova as a **group admin** with these permissions:
- Delete messages
- Ban users
- Restrict members
- Pin messages
- Invite users

| Command | Description |
|---------|-------------|
| `/help` | Show group commands |
| `/rules` | Show group rules |
| `/ai on\|off` | Toggle AI replies |
| `/style <mode>` | Set group AI style |
| `/welcome <text>` | Set welcome message (use `{name}` and `{group}`) |
| `/setrules <text>` | Set group rules |
| `/ban [@user\|id]` | Ban a user |
| `/unban [@user\|id]` | Unban a user |
| `/mute [@user\|id] [1m\|1h\|1d]` | Mute a user |
| `/unmute [@user\|id]` | Unmute a user |
| `/warn [@user\|id]` | Warn (auto-ban at 3) |
| `/warnings [@user\|id]` | Check warning count |
| `/clearwarn [@user\|id]` | Clear warnings |
| `/kick [@user\|id]` | Kick (ban + unban) |
| `/purge <n>` | Delete last N messages (max 100) |
| `/pin` | Pin replied message |
| `/unpin` | Unpin latest pin |
| `/delete` | Delete replied message |
| `/promote [@user\|id]` | Promote to admin |
| `/demote [@user\|id]` | Demote from admin |
| `/antilink on\|off` | Toggle anti-link protection |
| `/antiflood on\|off` | Toggle anti-flood protection |

### Owner Commands (Private Chat Only)

| Command | Description |
|---------|-------------|
| `/owner` or `/dashboard` | Show stats & command list |
| `/stats` | Detailed bot statistics |
| `/redeemcd <CODE> <duration>` | Create premium code (1d, 7d, 30d, 90d, lifetime) |
| `/listcodes` | List all redeem codes |
| `/lookup <user_id>` | Look up a user |
| `/broadcast <message>` | Send message to all users |
| `/grantpremium <user_id> <duration>` | Grant premium to user |
| `/revokepremium <user_id>` | Remove premium from user |
| `/banuser <user_id>` | Ban user from bot |
| `/unbanuser <user_id>` | Unban user from bot |
| `/clearuserdata <user_id>` | Clear user memory |

---

## Premium System

| Feature | Free | Premium |
|---------|------|---------|
| AI Chat | ✅ | ✅ |
| Images/day | 3 | 20 |
| Memory | Last 20 msgs | Last 20 msgs |
| Response quality | Standard | Enhanced |
| Style presets | ✅ | ✅ |

### Create a premium code (as owner):
```
/redeemcd NOVA-VIP-01 30d
```
Durations: `1d`, `7d`, `10d`, `30d`, `90d`, `1m`, `1y`, `lifetime`

### User redeems it:
```
/redeem NOVA-VIP-01
```

---

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/healthz` | — | Health check |
| `GET /api/bot/status` | — | Bot status + stats |
| `GET /api/admin/stats` | ADMIN_API_KEY | Full dashboard stats |
| `GET /api/admin/users` | ADMIN_API_KEY | List users (paginated) |
| `GET /api/admin/users/:id` | ADMIN_API_KEY | User detail |
| `POST /api/admin/users/:id/ban` | ADMIN_API_KEY | Ban user |
| `POST /api/admin/users/:id/unban` | ADMIN_API_KEY | Unban user |
| `POST /api/admin/users/:id/premium` | ADMIN_API_KEY | Set premium |
| `DELETE /api/admin/users/:id/memory` | ADMIN_API_KEY | Clear user memory |
| `POST /api/admin/broadcast` | ADMIN_API_KEY | Send broadcast |
| `GET /api/admin/codes` | ADMIN_API_KEY | List redeem codes |
| `POST /api/admin/codes` | ADMIN_API_KEY | Create redeem code |
| `GET /api/admin/analytics` | ADMIN_API_KEY | Analytics data |
| `GET /api/admin/logs` | ADMIN_API_KEY | Activity logs |

Admin endpoints require the `x-admin-key: <ADMIN_API_KEY>` header (or `Authorization: Bearer <key>`).

---

## Troubleshooting

### Bot not responding
- Check Render logs: Dashboard → your service → **Logs**
- Verify `TELEGRAM_BOT_TOKEN` is correct (no spaces)
- Make sure only ONE instance is running (polling conflicts if two run simultaneously)

### "Failed to ban/mute user"
- Nova must be a **group admin** with ban/restrict permissions
- Nova cannot act on users with higher admin rank

### "@username not found" in moderation commands
- Use the **reply method**: reply to the user's message, then type the command
- Or use their numeric user ID: `/ban 123456789`
- `@username` only works for users with public profiles or who've previously messaged Nova

### Image generation slow or failing
- HuggingFace models have a cold start (30-60s on first request)
- The bot tries SD3 first, falls back to SDXL automatically
- If consistently failing, check your `HUGGINGFACE_API_TOKEN`

### MongoDB connection failed
- Ensure **Network Access** in Atlas allows `0.0.0.0/0`
- Check your connection string includes the database name: `.../nova`
- Atlas free tier has a 500 connection limit — should be fine for a bot

### Admin dashboard can't connect
- Verify `ADMIN_API_KEY` is set on Render (Environment tab)
- Make sure the Backend URL has no trailing slash
- CORS is enabled on the backend for all origins

---

## Architecture

```
artifacts/api-server/src/
├── bot/
│   ├── handlers/
│   │   ├── privateHandler.ts    — Private chat commands + AI chat
│   │   ├── groupHandler.ts      — Group moderation + AI replies
│   │   ├── callbackHandler.ts   — Inline button interactions
│   │   └── ownerHandler.ts      — Owner-only admin commands
│   ├── models/
│   │   ├── User.ts              — User profiles, settings, premium
│   │   ├── Memory.ts            — Conversation history per user/chat
│   │   ├── RedeemCode.ts        — Premium redeem codes
│   │   ├── GroupSettings.ts     — Per-group config
│   │   └── Analytics.ts         — Event analytics (capped collection)
│   ├── services/
│   │   ├── ai.ts                — OpenRouter chat + memory management
│   │   ├── image.ts             — HuggingFace image gen + style presets
│   │   ├── db.ts                — MongoDB connection
│   │   ├── analytics.ts         — Analytics tracking helpers
│   │   └── keepAlive.ts         — Self-ping keep-alive system
│   ├── middlewares/
│   │   └── userMiddleware.ts    — User upsert, premium expiry, daily reset
│   ├── utils/
│   │   ├── helpers.ts           — Shared utilities + safeSend
│   │   └── rateLimiter.ts       — In-memory rate limiting + flood detection
│   └── index.ts                 — Bot startup, event routing, polling recovery
├── routes/
│   ├── health.ts                — GET /api/healthz
│   ├── bot.ts                   — GET /api/bot/status
│   ├── admin.ts                 — Admin API (protected by ADMIN_API_KEY)
│   └── index.ts                 — Route aggregator
└── index.ts                     — Express server + bot start + keep-alive

artifacts/admin-dashboard/src/
├── pages/
│   ├── Login.tsx                — API key login screen
│   ├── Dashboard.tsx            — Bot stats overview
│   ├── Users.tsx                — User management table
│   ├── Broadcast.tsx            — Broadcast message sender
│   ├── Codes.tsx                — Redeem code manager
│   ├── Analytics.tsx            — Event charts + top commands
│   └── Logs.tsx                 — Activity event stream
├── components/
│   └── Layout.tsx               — Sidebar navigation layout
└── lib/
    ├── api.ts                   — Typed API client
    └── utils.ts                 — Formatting utilities
```

---

## Stack

- **Runtime**: Node.js 24, TypeScript 5.9
- **Bot**: node-telegram-bot-api (polling mode)
- **AI**: OpenRouter — meta-llama/llama-3.3-70b-instruct
- **Images**: HuggingFace — stabilityai/stable-diffusion-3-medium-diffusers
- **Database**: MongoDB + Mongoose
- **Server**: Express 5
- **Build**: esbuild (ESM bundle)
- **Hosting**: Render Web Service (bot) + Vercel (optional dashboard)
- **Frontend**: React 18 + Vite + Tailwind CSS
