# RP Telegram Bot

Telegram RP bot with clothing, accessories, real-world vehicle and house catalogs, inventory, property, marketplace, profiles and exchanges.

## Railway deployment

1. Create a new Railway service from this GitHub repository.
2. Railway will use railway.json: build with pnpm and start the compiled API server.
3. Add the variables from .env.example in the Railway service. Keep TELEGRAM_BOT_TOKEN secret.
4. Add a Railway Volume mounted at /data and keep RP_BOT_DATA_FILE=/data/rp-bot.json. Without a volume, a redeploy can reset the JSON save file.
5. Deploy. The health endpoint is /api/health; the bot uses Telegram long polling, so no public Telegram webhook is required.

Railway provides PORT automatically. The server listens on it and starts the bot after the HTTP server is ready.

## Implemented gameplay

- Marketplace displays other players listings and your own listings; your listing can be cancelled and the asset is returned.
- Exchange supports items, cars and houses. After both assets are selected, the initiator enters an extra payment; enter 0 for a free exchange. Both players confirm before coins and assets move.
- Profile has a bottom keyboard action to enter another player ID and see equipped clothing, inventory and property.
- Catalog previews use real-photo URLs for clothing, accessories, cigarettes, cars and houses, with a generated fallback for Telegram failures. The police Bat-mobile is a purchasable police vehicle with red/blue emergency lights.

## Local commands

pnpm install
pnpm run build
PORT=8080 TELEGRAM_BOT_TOKEN=... pnpm --filter @workspace/api-server start
