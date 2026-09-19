# RP Telegram Bot

Telegram RP bot with clothing, accessories, real-world vehicle and house catalogs, inventory, property, marketplace, profiles and exchanges.

## Railway deployment

1. Create a new Railway service from this GitHub repository.
2. Railway uses `railway.json`: it pins pnpm and builds only the Telegram API service.
3. Add the variables listed below. Keep `TELEGRAM_BOT_TOKEN` secret.
4. Add a Railway Volume mounted at `/data/` and keep `RP_BOT_DATA_FILE=/data/rp-bot.json`. Without a volume, a redeploy can reset the JSON save file.
5. Deploy. The health endpoint is `/api/health`; the bot uses Telegram long polling, so no public Telegram webhook is required.

### Railway variables

- `TELEGRAM_BOT_TOKEN` — **required secret**, create it with @BotFather.
- `TELEGRAM_ADMIN_ID` — optional numeric Telegram user ID for admin commands.
- `RP_BOT_DATA_FILE` — optional; set to `/data/rp-bot.json` when using a Railway Volume.
- `PORT` — supplied automatically by Railway; do not hard-code it in Railway.
- `NODE_ENV` — optional; use `production`.
- `LOG_LEVEL` — optional; defaults to `info`.
- `DATABASE_URL` — optional for the current bot. The current game store uses JSON; this variable is reserved for DB-backed features.

### Neon PostgreSQL

Create a database at [Neon Console](https://console.neon.tech/app/projects/new). In Neon, copy the pooled connection string and add it to Railway as:

`DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`

Do not commit the real connection string to GitHub or send it in chat.

Railway provides `PORT` automatically. The server listens on it and starts the bot after the HTTP server is ready.

## Implemented gameplay

- Marketplace displays other players listings and your own listings; your listing can be cancelled and the asset is returned.
- Exchange supports items, cars and houses. After both assets are selected, the initiator enters an extra payment; enter 0 for a free exchange. Both players confirm before coins and assets move.
- Profile has a bottom keyboard action to enter another player ID and see equipped clothing, inventory and property.
- Catalog previews are locally drawn item cards, so Telegram no longer depends on old stock-photo URLs. The catalog includes a thicker golden cigarette with a 100,000,000-coin passive bonus, a small children's airplane (ID 7777), and a police Bat-mobile illustration with red/blue emergency lights. The golden cigarette, airplane and Bat-mobile are not available on the player marketplace; the Bat-mobile remains available through admin grants.

## Local commands

`pnpm install`
`pnpm run build`
`PORT=8080 TELEGRAM_BOT_TOKEN=... pnpm --filter @workspace/api-server start`
