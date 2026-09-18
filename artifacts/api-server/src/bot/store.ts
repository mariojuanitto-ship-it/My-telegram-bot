import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { catalogById, type CatalogKind } from "./catalog";

export type OwnedItem = {
  instanceId: string;
  catalogId: number;
  equipped: boolean;
};

export type User = {
  userId: number;
  telegramId: string;
  username: string;
  displayName: string;
  coins: string;
  donate: string;
  level: number;
  exp: number;
  inventory: OwnedItem[];
  cars: OwnedItem[];
  houses: OwnedItem[];
  lastWorkAt: string;
  clanId?: string;
};

export type Promo = {
  code: string;
  type: "money" | "donate" | "item";
  value: string;
  activations: number;
  maxActivations: number;
  redeemedBy: string[];
};

export type SupportTicket = {
  id: number;
  userId: number;
  text: string;
  status: "open" | "answered";
  answer?: string;
  createdAt: string;
};

export type Listing = {
  id: number;
  sellerId: number;
  assetType: "item" | "car" | "house";
  item: OwnedItem;
  price: string;
};

export type Clan = {
  id: string;
  name: string;
  ownerId: number;
  memberIds: number[];
};

export type TradeOffer = {
  id: number;
  initiatorId: number;
  targetId: number;
  kind: "any" | "items" | "property";
  initiatorAsset?: OwnedItem;
  targetAsset?: OwnedItem;
  /** Coins paid by the initiator to the target. Old saves default to 0. */
  extraPayment?: string;
  initiatorReady: boolean;
  targetReady: boolean;
  status: "pending" | "completed" | "cancelled";
};

type BotState = {
  nextUserId: number;
  nextInstanceId: number;
  nextTicketId: number;
  nextListingId: number;
  nextTradeId: number;
  users: Record<string, User>;
  promos: Promo[];
  supportTickets: SupportTicket[];
  listings: Listing[];
  clans: Clan[];
  trades: TradeOffer[];
};

const initialState = (): BotState => ({
  nextUserId: 1,
  nextInstanceId: 1,
  nextTicketId: 1,
  nextListingId: 1,
  nextTradeId: 1,
  users: {},
  promos: [],
  supportTickets: [],
  listings: [],
  clans: [],
  trades: [],
});

function normalizeState(input: Partial<BotState> | undefined): BotState {
  const initial = initialState();
  return {
    ...initial,
    ...input,
    users: input?.users ?? initial.users,
    promos: input?.promos ?? initial.promos,
    supportTickets: input?.supportTickets ?? initial.supportTickets,
    listings: input?.listings ?? initial.listings,
    clans: input?.clans ?? initial.clans,
    trades: (input?.trades ?? initial.trades).map((trade) => ({
      ...trade,
      extraPayment: trade.extraPayment ?? "0",
    })),
  };
}

export class GameStore {
  private state: BotState = initialState();
  private saveChain: Promise<void> = Promise.resolve();
  private readonly filePath = path.resolve(
    process.env["RP_BOT_DATA_FILE"] ?? "data/rp-bot.json",
  );
  private readonly database = process.env["DATABASE_URL"]
    ? new Pool({
        connectionString: process.env["DATABASE_URL"],
        max: 5,
        ssl: process.env["DATABASE_URL"].includes("neon.tech")
          ? { rejectUnauthorized: false }
          : undefined,
      })
    : undefined;

  async load() {
    if (this.database) {
      await this.database.query(`
        CREATE TABLE IF NOT EXISTS rp_game_state (
          id integer PRIMARY KEY,
          state jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      const result = await this.database.query<{ state: BotState }>(
        "SELECT state FROM rp_game_state WHERE id = 1",
      );
      if (result.rows[0]?.state) {
        this.state = normalizeState(result.rows[0].state);
        return;
      }

      const fileState = await this.readFileState();
      this.state = fileState ?? initialState();
      await this.save();
      return;
    }
    const fileState = await this.readFileState();
    this.state = fileState ?? initialState();
    if (!fileState) await this.save();
  }

  private async readFileState() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeState(JSON.parse(raw) as Partial<BotState>);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return undefined;
    }
  }

  private save() {
    const serialized = JSON.stringify(this.state, null, 2);
    this.saveChain = this.saveChain.then(async () => {
      if (this.database) {
        await this.database.query(
          `INSERT INTO rp_game_state (id, state, updated_at)
           VALUES (1, $1::jsonb, now())
           ON CONFLICT (id) DO UPDATE
           SET state = EXCLUDED.state, updated_at = now()`,
          [serialized],
        );
      } else {
        await writeFile(this.filePath, serialized, "utf8");
      }
    });
    return this.saveChain;
  }

  get users() {
    return Object.values(this.state.users);
  }

  get tickets() {
    return this.state.supportTickets;
  }

  get promos() {
    return this.state.promos;
  }

  get clans() {
    return this.state.clans;
  }

  get listings() {
    return this.state.listings;
  }

  get trades() {
    return this.state.trades;
  }

  findUser(telegramId: string) {
    return this.state.users[telegramId];
  }

  findUserById(userId: number) {
    return this.users.find((user) => user.userId === userId);
  }

  async registerUser(input: { telegramId: string; username?: string; displayName: string }) {
    const existing = this.findUser(input.telegramId);
    if (existing) {
      existing.username = input.username ?? existing.username;
      existing.displayName = input.displayName;
      await this.save();
      return existing;
    }
    const user: User = {
      userId: this.state.nextUserId++,
      telegramId: input.telegramId,
      username: input.username ? `@${input.username}` : "не указан",
      displayName: input.displayName,
      coins: "5000000",
      donate: "0",
      level: 1,
      exp: 0,
      inventory: [],
      cars: [],
      houses: [],
      lastWorkAt: "0",
    };
    this.state.users[input.telegramId] = user;
    await this.save();
    return user;
  }

  async updateUser(user: User) {
    this.state.users[user.telegramId] = user;
    await this.save();
  }

  nextInstanceId() {
    return `item-${this.state.nextInstanceId++}`;
  }

  async addOwned(user: User, catalogId: number) {
    const item = catalogById.get(catalogId);
    if (!item) throw new Error(`Unknown catalog item ${catalogId}`);
    const owned = { instanceId: this.nextInstanceId(), catalogId, equipped: false };
    if (item.kind === "cars") user.cars.push(owned);
    else if (item.kind === "houses") user.houses.push(owned);
    else user.inventory.push(owned);
    await this.updateUser(user);
    return owned;
  }

  async removeOwned(user: User, asset: OwnedItem) {
    const lists = [user.inventory, user.cars, user.houses];
    for (const list of lists) {
      const index = list.findIndex((entry) => entry.instanceId === asset.instanceId);
      if (index !== -1) {
        list.splice(index, 1);
        await this.updateUser(user);
        return true;
      }
    }
    return false;
  }

  getOwned(user: User, instanceId: string) {
    return [...user.inventory, ...user.cars, ...user.houses].find(
      (item) => item.instanceId === instanceId,
    );
  }

  async restoreOwned(user: User, asset: OwnedItem) {
    const item = catalogById.get(asset.catalogId);
    if (!item || this.getOwned(user, asset.instanceId)) return false;
    if (item.kind === "cars") user.cars.push({ ...asset, equipped: false });
    else if (item.kind === "houses") user.houses.push({ ...asset, equipped: false });
    else user.inventory.push({ ...asset, equipped: false });
    await this.updateUser(user);
    return true;
  }

  async addTicket(userId: number, text: string) {
    const ticket: SupportTicket = {
      id: this.state.nextTicketId++,
      userId,
      text,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.state.supportTickets.push(ticket);
    await this.save();
    return ticket;
  }

  async answerTicket(ticketId: number, answer: string) {
    const ticket = this.state.supportTickets.find((entry) => entry.id === ticketId);
    if (!ticket) return undefined;
    ticket.status = "answered";
    ticket.answer = answer;
    await this.save();
    return ticket;
  }

  async addPromo(promo: Promo) {
    this.state.promos.push(promo);
    await this.save();
  }

  async redeemPromo(user: User, code: string) {
    const promo = this.state.promos.find((entry) => entry.code.toLowerCase() === code.toLowerCase());
    if (!promo) return { ok: false as const, reason: "Промокод не найден." };
    if (promo.redeemedBy.includes(user.telegramId)) {
      return { ok: false as const, reason: "Вы уже активировали этот промокод." };
    }
    if (promo.maxActivations > 0 && promo.activations >= promo.maxActivations) {
      return { ok: false as const, reason: "Лимит активаций промокода исчерпан." };
    }
    promo.activations += 1;
    promo.redeemedBy.push(user.telegramId);
    if (promo.type === "money") user.coins = (BigInt(user.coins) + BigInt(promo.value)).toString();
    if (promo.type === "donate") user.donate = (BigInt(user.donate) + BigInt(promo.value)).toString();
    if (promo.type === "item") {
      const item = catalogById.get(Number(promo.value));
      if (!item) return { ok: false as const, reason: "Предмет в промокоде больше не существует." };
      const owned = { instanceId: this.nextInstanceId(), catalogId: item.id, equipped: false };
      if (item.kind === "cars") user.cars.push(owned);
      else if (item.kind === "houses") user.houses.push(owned);
      else user.inventory.push(owned);
    }
    await this.updateUser(user);
    return { ok: true as const, promo };
  }

  async addListing(listing: Omit<Listing, "id">) {
    const created = { ...listing, id: this.state.nextListingId++ };
    this.state.listings.push(created);
    await this.save();
    return created;
  }

  async removeListing(listingId: number) {
    const index = this.state.listings.findIndex((listing) => listing.id === listingId);
    if (index === -1) return undefined;
    const [listing] = this.state.listings.splice(index, 1);
    await this.save();
    return listing;
  }

  async addClan(name: string, ownerId: number) {
    const clan: Clan = {
      id: `CLAN-${String(this.state.clans.length + 1).padStart(4, "0")}`,
      name,
      ownerId,
      memberIds: [ownerId],
    };
    this.state.clans.push(clan);
    await this.save();
    return clan;
  }

  async addClanMember(clan: Clan, userId: number) {
    if (!clan.memberIds.includes(userId)) clan.memberIds.push(userId);
    await this.save();
  }

  async addTrade(trade: Omit<TradeOffer, "id">) {
    const created = { ...trade, id: this.state.nextTradeId++ };
    this.state.trades.push(created);
    await this.save();
    return created;
  }

  async updateTrade(trade: TradeOffer) {
    const index = this.state.trades.findIndex((entry) => entry.id === trade.id);
    if (index !== -1) this.state.trades[index] = trade;
    await this.save();
  }

  itemsByKind(kind: CatalogKind) {
    return [...catalogById.values()].filter((item) => item.kind === kind && !item.hidden);
  }
}
