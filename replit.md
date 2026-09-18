# RP City Telegram Bot

Telegram RP-бот с профилем игрока, экономикой, магазинами, имуществом, работами, казино и админ-инструментами.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `TELEGRAM_BOT_TOKEN` — token from BotFather
- Required env: `TELEGRAM_ADMIN_ID` — numeric Telegram ID of the bot owner

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/catalog.ts` — store catalog and item IDs
- `artifacts/api-server/src/bot/store.ts` — persistent game state and economy operations
- `artifacts/api-server/src/bot/telegram.ts` — Telegram Bot API client and keyboards
- `artifacts/api-server/src/bot/index.ts` — update polling and all player/admin flows
- `data/rp-bot.json` — runtime game state, created automatically on first start

## Architecture decisions

- Telegram long polling is used so the bot works without a public webhook URL.
- Game balances are stored as decimal strings and calculated with `bigint`, including casino bets up to 1 quintillion.
- The first registered Telegram user receives internal ID 1; later users receive monotonically increasing IDs.
- The data file is written after each state mutation so restarts preserve players, items, promos, tickets, clans, listings, and trades.

## Product

- Persistent player profile with coins, donation balance, level and experience.
- Bottom Telegram keyboard for profile, shop, donation, support, casino, Forbes, clans, marketplace, exchange and jobs.
- Clothing, accessory, car and house catalogs with IDs, buying, inventory, equipping and government resale.
- Admin-only grants, support replies, promo-code creation and catalog ID lookup.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The administrator ID must match the numeric Telegram account ID, not a username.
- The bot uses long polling; do not run a second copy with the same token.
- `data/rp-bot.json` is the source of persisted game state for this MVP.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
