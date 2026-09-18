import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * The Telegram bot keeps its domain model in one JSON document so the
 * existing game code can remain synchronous in-memory while writes are
 * durable in Neon/PostgreSQL.
 */
export const rpGameStateTable = pgTable("rp_game_state", {
  id: integer("id").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});