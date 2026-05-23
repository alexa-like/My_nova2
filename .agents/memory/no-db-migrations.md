---
name: No DB migrations ever
description: Nova bot uses MongoDB exclusively; the Drizzle/PostgreSQL db package is a monorepo artifact that must never be migrated or pushed.
---

# No database migrations — ever

This project uses **MongoDB + Mongoose** for all bot data (users, memory, premium, redeem codes, group settings, bot config, reminders).

The monorepo contains an `@workspace/db` package with Drizzle ORM and a PostgreSQL schema. This package is **not used** by the bot. It is a leftover from the project scaffold.

**Rule:** Never add any of the following to `scripts/post-merge.sh`, any workflow, or any other script:
- `pnpm --filter db push`
- `pnpm --filter @workspace/db run push`
- `drizzle-kit push`
- `drizzle-kit migrate`
- Any PostgreSQL migration command

**Why:** The owner permanently removed these commands because migration auto-detection kept re-running them on every task merge, causing confusion. The MongoDB collections are schema-less and managed entirely by Mongoose at runtime — no migration step is ever needed.

**How to apply:** If you are about to add a DB push or migration command anywhere, stop. Check this note. The answer is always: do not add it.

**Current post-merge script** (`scripts/post-merge.sh`) correctly contains only:
```bash
pnpm install --frozen-lockfile
```
Keep it that way.
