#!/bin/bash
set -e
# Nova AI Bot — post-merge setup
#
# DB NOTE: This project uses MongoDB (Mongoose) for ALL bot data.
# The @workspace/db Drizzle/PostgreSQL package exists in the monorepo but is NOT used by the bot.
# DO NOT add "pnpm --filter db push", "drizzle-kit push", or any migration command here.
# No database migrations are needed or wanted — ever.
pnpm install --frozen-lockfile
