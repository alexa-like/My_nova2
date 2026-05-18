# Nova AI Bot 🤖💖

A production-ready Telegram AI assistant with human-like personality, group moderation, image generation, premium system, owner dashboard, and an optional web admin panel.

---

## Features

- **AI Chat** — Human-like conversations powered by OpenRouter (Llama 3.3 70B)
- **Image Generation** — Stable Diffusion 3 via HuggingFace with 8 style presets
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

## Full Deployment Guide

### Part 1 — Get Your API Keys First

Before deploying, collect all the keys you'll need. Open each link below in a new tab.

#### 1. Telegram Bot Token
1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. `Nova AI`) and a username (e.g. `mynova_bot`)
4. BotFather will send you a token — copy it. It looks like: `7123456789:AAF...`

#### 2. Your Telegram User ID (Owner ID)
1. Open Telegram and search for **@userinfobot**
2. Send `/start`
3. It will reply with your user ID — copy the number (e.g. `987654321`)

#### 3. MongoDB URI (Free Database)
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and sign up free
2. Click **Create** → choose **M0 Free** tier → pick any region → click **Create**
3. Under **Security → Database Access**, create a user with a password — save the password
4. Under **Security → Network Access**, click **Add IP Address** → choose **Allow Access from Anywhere** → Confirm
5. Click **Connect** → **Drivers** → copy the connection string
6. Replace `<password>` with your password and add `/nova` before the `?`:
   ```
   mongodb+srv://youruser:yourpassword@cluster.mongodb.net/nova?retryWrites=true&w=majority
   ```

#### 4. OpenRouter API Key (AI Chat)
1. Go to [openrouter.ai](https://openrouter.ai) and sign up
2. Go to **Keys** → **Create Key** → copy it
3. The Llama 3.3 70B model used by Nova is free with a rate limit

#### 5. HuggingFace Token (Image Generation)
1. Go to [huggingface.co](https://huggingface.co) and sign up
2. Go to **Settings → Access Tokens** → **New token** → Role: **Read** → copy it

---

### Part 2 — Push to GitHub

> **Note:** If you're pushing from Replit, always use this format to avoid Git LFS errors:

Open the **Shell** tab in Replit and run (replace placeholders):

```bash
GIT_LFS_SKIP_PUSH=1 git push https://YOUR_GITHUB_USERNAME:YOUR_GITHUB_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git main --force
```

**Don't have a GitHub token?**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Check the **`repo`** scope
4. Click **Generate token** → copy it immediately

> Keep your GitHub token private — never share it. If you accidentally expose it, go revoke it immediately at the link above.

---

### Part 3 — Deploy to Render (Free Hosting)

1. Go to [render.com](https://render.com) and sign up (free account)
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select your Nova repository
4. Render will detect `render.yaml` automatically — click **Apply**
5. Wait for the build to finish (takes 2–3 minutes the first time)

**Once deployed, set your environment variables:**

Go to your Render service → **Environment** tab → add each variable:

| Variable | Example Value | Where to get it |
|----------|--------------|-----------------|
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAF...` | Step 1 above |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/nova` | Step 3 above |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Step 4 above |
| `HUGGINGFACE_API_TOKEN` | `hf_...` | Step 5 above |
| `OWNER_ID` | `987654321` | Step 2 above |
| `SESSION_SECRET` | any random string | Make one up or use [randomkeygen.com](https://randomkeygen.com) |
| `SERVER_URL` | `https://your-service.onrender.com` | Your Render service URL — found at the top of the service page |
| `ADMIN_API_KEY` | any secret string | Make one up — used to log into the web dashboard |

After adding variables, click **Save Changes** — Render will automatically restart your bot.

> **Finding your Render URL:** On your service page, the URL is shown at the top in blue. Copy the full URL (e.g. `https://nova-bot-xyz.onrender.com`) and paste it as `SERVER_URL`.

---

### Part 4 — Keep the Bot Always Online (Free)

Render's free tier sleeps after 15 minutes of inactivity. Nova has a **built-in self-ping** system — just set `SERVER_URL` (done above) and it pings itself every 5 minutes automatically.

For extra reliability, add a second pinger with UptimeRobot (free):
1. Go to [uptimerobot.com](https://uptimerobot.com) and sign up
2. Click **Add New Monitor**
3. Type: **HTTP(s)** | Friendly name: `Nova Bot`
4. URL: `https://your-service.onrender.com/api/healthz`
5. Monitoring interval: **5 minutes**
6. Click **Create Monitor**

That's it — your bot will now stay online 24/7 on the free tier.

---

### Part 5 — Web Admin Dashboard (Optional)

The admin dashboard is a separate website you can deploy to Vercel for free.

#### Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
2. Click **Add New** → **Project**
3. Import your Nova GitHub repository
4. Under **Root Directory**, click **Edit** and type: `artifacts/admin-dashboard`
5. Leave everything else as default → click **Deploy**
6. Wait ~1 minute for deployment to finish

#### Connect to Your Bot

1. Open your Vercel dashboard URL (e.g. `https://nova-admin-xyz.vercel.app`)
2. In the **Backend URL** field, enter your Render service URL (e.g. `https://nova-bot-xyz.onrender.com`)
3. In the **Admin API Key** field, enter your `ADMIN_API_KEY` (the one you set on Render)
4. Click **Connect**

#### Dashboard Pages

| Page | What it does |
|------|-------------|
| **Dashboard** | Bot online status, user counts, usage at a glance |
| **Users** | Browse all users, search, ban/unban, grant/remove premium, clear memory |
| **Broadcast** | Send a message to all users or premium-only users |
| **Codes** | Create and manage premium redeem codes |
| **Analytics** | Daily event bar charts + top commands list |
| **Logs** | Live activity event stream with event type filters |

---

## Bot Commands

### Private Chat (Any User)

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show all commands |
| `/image <prompt>` | Generate an image |
| `/image <prompt> --style <preset>` | Generate with a style preset |
| `/profile` | View your profile and usage stats |
| `/settings` | View your current settings |
| `/premium` | Check your premium status |
| `/redeem <code>` | Redeem a premium code |
| `/forget` | Clear your conversation memory |
| `/style friendly\|funny\|serious\|balanced` | Change AI personality |
| `/length long\|short` | Change reply length |
| `/emoji on\|off` | Toggle emojis in replies |

### Image Style Presets

Use `--style <name>` with `/image`:

| Preset | Description |
|--------|-------------|
| `anime` | Anime / Studio Ghibli style |
| `realistic` | Photorealistic, 8K detail |
| `oil` | Oil painting, impressionist |
| `watercolor` | Soft watercolor art |
| `cyberpunk` | Neon lights, futuristic city |
| `fantasy` | Magical fantasy art |
| `sketch` | Pencil sketch, line art |
| `pixel` | Pixel art, retro game style |

**Example:** `/image a cat sitting on a rooftop --style cyberpunk`

### Group Commands (Group Admins Only)

First, **add Nova to your group** and make it an admin with these permissions:
- Delete messages, Ban users, Restrict members, Pin messages, Invite users

| Command | Description |
|---------|-------------|
| `/help` | Show group commands |
| `/rules` | Show group rules |
| `/ai on\|off` | Toggle AI replies in the group |
| `/style <mode>` | Set group AI personality |
| `/welcome <text>` | Set welcome message — use `{name}` and `{group}` |
| `/setrules <text>` | Set group rules |
| `/ban [@user or reply]` | Ban a user from the group |
| `/unban [@user or reply]` | Unban a user |
| `/mute [@user or reply] [1m\|1h\|1d]` | Mute a user temporarily |
| `/unmute [@user or reply]` | Unmute a user |
| `/warn [@user or reply]` | Warn a user (auto-ban at 3 warnings) |
| `/warnings [@user or reply]` | Check warning count |
| `/clearwarn [@user or reply]` | Clear all warnings for a user |
| `/kick [@user or reply]` | Remove user from group (can rejoin) |
| `/purge <number>` | Delete last N messages (max 100) |
| `/pin` | Pin the message you replied to |
| `/unpin` | Unpin the latest pinned message |
| `/delete` | Delete the message you replied to |
| `/promote [@user or reply]` | Make a user admin |
| `/demote [@user or reply]` | Remove admin from a user |
| `/antilink on\|off` | Delete messages containing links |
| `/antiflood on\|off` | Auto-mute users who spam messages |

> **Tip:** For moderation commands, reply to the user's message instead of typing their username — it's more reliable.

### Owner Commands (Your Private Chat Only)

| Command | Description |
|---------|-------------|
| `/owner` or `/dashboard` | Show bot stats and command list |
| `/stats` | Detailed statistics |
| `/redeemcd <CODE> <duration>` | Create a premium code |
| `/listcodes` | List all premium codes |
| `/lookup <user_id>` | Look up a user's profile |
| `/broadcast <message>` | Send a message to all users |
| `/grantpremium <user_id> <duration>` | Give premium to a user |
| `/revokepremium <user_id>` | Remove premium from a user |
| `/banuser <user_id>` | Ban a user from the bot |
| `/unbanuser <user_id>` | Unban a user |
| `/clearuserdata <user_id>` | Clear a user's conversation memory |

**Duration formats:** `1d` `7d` `30d` `90d` `1y` `lifetime`

**Example:** `/redeemcd NOVA-VIP-2025 30d`

---

## Premium System

| Feature | Free | Premium |
|---------|------|---------|
| AI Chat | ✅ Unlimited | ✅ Unlimited |
| Image generation | 3 per day | 20 per day |
| Style presets | ✅ | ✅ |
| Conversation memory | Last 20 messages | Last 20 messages |

**As owner, create a code:**
```
/redeemcd NOVA-GIFT-01 30d
```

**Share the code with a user — they redeem it with:**
```
/redeem NOVA-GIFT-01
```

---

## Admin API Reference

All admin endpoints require the header: `x-admin-key: YOUR_ADMIN_API_KEY`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/healthz` | Health check (no auth) |
| GET | `/api/bot/status` | Bot status and basic stats (no auth) |
| GET | `/api/admin/stats` | Full dashboard stats |
| GET | `/api/admin/users` | List users — supports `?page=1&limit=20&search=&premium=true&banned=true` |
| GET | `/api/admin/users/:id` | Single user details |
| POST | `/api/admin/users/:id/ban` | Ban a user |
| POST | `/api/admin/users/:id/unban` | Unban a user |
| POST | `/api/admin/users/:id/premium` | Set premium — body: `{ "active": true, "days": 30 }` |
| DELETE | `/api/admin/users/:id/memory` | Clear user's conversation memory |
| POST | `/api/admin/broadcast` | Send broadcast — body: `{ "message": "...", "premiumOnly": false }` |
| GET | `/api/admin/codes` | List all redeem codes |
| POST | `/api/admin/codes` | Create code — body: `{ "code": "NOVA-XYZ", "duration": "30d" }` |
| GET | `/api/admin/analytics` | Analytics data — supports `?days=7` |
| GET | `/api/admin/logs` | Activity logs — supports `?limit=50&event=error` |

---

## Troubleshooting

### Bot not responding after deployment
- Check Render logs: your service → **Logs** tab
- Make sure all environment variables are set correctly (no extra spaces)
- Verify `TELEGRAM_BOT_TOKEN` works by visiting: `https://api.telegram.org/bot<YOUR_TOKEN>/getMe`

### Push to GitHub failing with "index-pack failed"
This is a Replit LFS issue. Always push with this command from the Shell tab:
```bash
GIT_LFS_SKIP_PUSH=1 git push https://USERNAME:TOKEN@github.com/USERNAME/REPO.git main --force
```

### "Failed to ban/mute user" in groups
- Nova must be a group admin with ban/restrict permissions
- Nova cannot act on users with equal or higher admin rank than itself

### "@username not found" in moderation commands
- Reply to the user's message first, then type the command — this is the most reliable method
- Or use their numeric user ID: `/ban 123456789`

### Image generation slow or failing
- HuggingFace cold-starts take 30–60 seconds on first request — just wait and retry
- Nova automatically falls back from SD3 to SDXL if SD3 fails
- If consistently failing, double-check your `HUGGINGFACE_API_TOKEN`

### MongoDB connection error
- Confirm Network Access in Atlas shows `0.0.0.0/0` (allow from anywhere)
- Check your connection string includes the database name: `.../nova?retryWrites=...`
- Make sure the password in the URI doesn't contain special characters (URL-encode them if it does)

### Admin dashboard "connection failed"
- Make sure `ADMIN_API_KEY` is set on Render (Environment tab) and you saved the changes
- The backend URL should have no trailing slash: `https://nova-bot.onrender.com`
- If the bot is sleeping (Render free tier), the first request may take 30–60 seconds to wake it

---

## Project Structure

```
artifacts/api-server/src/
├── bot/
│   ├── handlers/
│   │   ├── privateHandler.ts    — Private chat commands + AI chat
│   │   ├── groupHandler.ts      — Group moderation + AI replies
│   │   ├── callbackHandler.ts   — Inline button interactions
│   │   └── ownerHandler.ts      — Owner-only commands
│   ├── models/
│   │   ├── User.ts              — User profiles, settings, premium
│   │   ├── Memory.ts            — Conversation history
│   │   ├── RedeemCode.ts        — Premium redeem codes
│   │   ├── GroupSettings.ts     — Per-group configuration
│   │   └── Analytics.ts         — Event log (capped collection)
│   ├── services/
│   │   ├── ai.ts                — OpenRouter chat completion
│   │   ├── image.ts             — HuggingFace image gen + 8 style presets
│   │   ├── db.ts                — MongoDB connection
│   │   ├── analytics.ts         — Analytics tracking helpers
│   │   └── keepAlive.ts         — Self-ping to prevent Render sleep
│   ├── middlewares/
│   │   └── userMiddleware.ts    — User upsert, premium expiry, daily reset
│   ├── utils/
│   │   ├── helpers.ts           — Shared utilities
│   │   └── rateLimiter.ts       — Rate limiting + flood detection
│   └── index.ts                 — Bot startup, event routing, polling recovery
├── routes/
│   ├── health.ts                — GET /api/healthz
│   ├── bot.ts                   — GET /api/bot/status
│   ├── admin.ts                 — Admin API (14 protected endpoints)
│   └── index.ts                 — Route aggregator
└── index.ts                     — Express server + bot start + keep-alive

artifacts/admin-dashboard/src/
├── pages/
│   ├── Login.tsx                — Connection screen
│   ├── Dashboard.tsx            — Stats overview
│   ├── Users.tsx                — User management
│   ├── Broadcast.tsx            — Mass messaging
│   ├── Codes.tsx                — Redeem code manager
│   ├── Analytics.tsx            — Charts + top commands
│   └── Logs.tsx                 — Event stream
├── components/
│   └── Layout.tsx               — Sidebar navigation
└── lib/
    ├── api.ts                   — Typed API client
    └── utils.ts                 — Date/time formatting helpers
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24, TypeScript 5.9 |
| Bot | node-telegram-bot-api (polling) |
| AI | OpenRouter — Llama 3.3 70B |
| Images | HuggingFace — Stable Diffusion 3 |
| Database | MongoDB + Mongoose |
| Server | Express 5 |
| Build | esbuild (ESM bundle) |
| Bot hosting | Render Web Service (free tier) |
| Dashboard hosting | Vercel (free tier) |
| Frontend | React 18, Vite, Tailwind CSS |
