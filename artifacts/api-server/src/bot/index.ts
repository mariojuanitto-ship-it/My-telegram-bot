import { logger } from "../lib/logger";
import {
  catalog,
  catalogById,
  categoryLabels,
  clothingKinds,
  type CatalogItem,
  type CatalogKind,
} from "./catalog";
import {
  GameStore,
  type Clan,
  type Listing,
  type OwnedItem,
  type TradeOffer,
  type User,
} from "./store";
import {
  inline,
  logTelegramError,
  mainKeyboard,
  telegram,
  type InlineKeyboardButton,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram";
import { renderAssetCard, renderCharacter } from "./character";

type Session =
  | { type: "promo" }
  | { type: "support" }
  | { type: "casino" }
  | { type: "clanName" }
  | { type: "clanJoin" }
  | { type: "clanInviteUser" }
  | { type: "clanRankUser" }
  | { type: "clanRankValue"; targetId: number }
  | { type: "clanRankNumber" }
  | { type: "clanRankName"; rank: number }
  | { type: "clanKickUser" }
  | { type: "clanChat" }
  | { type: "marketTarget"; assetType: "item" | "car" | "house" }
  | { type: "marketPrice"; assetType: "item" | "car" | "house"; instanceId: string }
  | { type: "tradeTarget"; kind: "any" | "items" | "property" }
  | { type: "tradePayment"; tradeId: number }
  | { type: "profileTarget" }
  | { type: "adminMoneyUser" }
  | { type: "adminMoneyAmount"; targetId: number }
  | { type: "adminDonateUser" }
  | { type: "adminDonateAmount"; targetId: number }
  | { type: "adminItemUser" }
  | { type: "adminItemId"; targetId: number }
  | { type: "adminReply"; ticketId: number }
  | { type: "adminBroadcast" }
  | { type: "promoCode"; promoType: "money" | "donate" | "item" }
  | { type: "promoMax"; promoType: "money" | "donate" | "item"; code: string }
  | { type: "promoValue"; promoType: "money" | "donate" | "item"; code: string; max: number };

const store = new GameStore();
const sessions = new Map<string, Session>();
const ADMIN_ID = () => process.env["TELEGRAM_ADMIN_ID"] ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const money = (value: string | bigint | number) => {
  const raw = BigInt(value);
  return `${raw.toLocaleString("ru-RU")} монет`;
};

const donate = (value: string | bigint | number) => `${BigInt(value).toLocaleString("ru-RU")} доната`;

const amountFromText = (text: string) => {
  const normalized = text.replace(/[^\d]/g, "");
  if (!normalized) return undefined;
  return BigInt(normalized);
};

const userName = (user: User) => user.username !== "не указан" ? user.username : user.displayName;

const isAdmin = (telegramId: string) => Boolean(ADMIN_ID()) && telegramId === ADMIN_ID();

const item = (catalogId: number) => catalogById.get(catalogId);

const xpToNext = (level: number) => level * level * 100;

function addExp(user: User, exp: number) {
  user.exp += exp;
  let levelUp = false;
  while (user.exp >= xpToNext(user.level)) {
    user.exp -= xpToNext(user.level);
    user.level += 1;
    levelUp = true;
  }
  return levelUp;
}

function itemLine(owned: OwnedItem) {
  const product = item(owned.catalogId);
  return product ? `${product.name} · ID ${product.id}${owned.equipped ? " · надето" : ""}` : `Неизвестный предмет · ID ${owned.catalogId}`;
}

const kindLabel = (product: CatalogItem) => categoryLabels[product.kind];

const productPhoto = (product: CatalogItem) => {
  // Never use a random stock photo for property. The generated card is
  // stable and is labelled with the exact model, so a VAZ cannot become a
  // Lamborghini or a bear.
  if (product.kind === "cars" || product.kind === "houses") return renderAssetCard(product);
  if (product.imageUrl) return product.imageUrl;
  const name = product.name.toLowerCase();
  const photoByKind: Partial<Record<CatalogKind, string[]>> = {
    sneakers: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=85",
    ],
    shirts: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=900&q=85",
    ],
    pants: [
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=85",
    ],
    jackets: [
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=85",
    ],
    hats: [
      "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1514327605112-b887c0e61c0a?auto=format&fit=crop&w=900&q=85",
    ],
    accessories: name.includes("папирос") || /marlboro|kent|winston|camel|dunhill/.test(name)
      ? ["https://loremflickr.com/900/900/gold,cigarette,product?lock=6767"]
      : ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=85"],
    donate: ["https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85"],
  };
  const photos = photoByKind[product.kind] ?? [];
  return photos[product.id % photos.length] ?? ("https://loremflickr.com/900/900/" + encodeURIComponent(kindLabel(product)) + "?lock=" + product.id);
};

async function sendText(chatId: number, text: string, telegramId?: string) {
  await telegram.sendMessage(chatId, text, telegramId ? mainKeyboard(isAdmin(telegramId)) : undefined);
}

async function sendLong(chatId: number, text: string, telegramId?: string) {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + line).length > 3800) {
      chunks.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) await sendText(chatId, chunk.trim(), telegramId);
}

async function getUser(message: TelegramMessage) {
  if (!message.from) return undefined;
  return store.registerUser({
    telegramId: String(message.from.id),
    username: message.from.username,
    displayName: [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "Игрок",
  });
}

async function getCallbackUser(callback: TelegramCallbackQuery) {
  return store.registerUser({
    telegramId: String(callback.from.id),
    username: callback.from.username,
    displayName: [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ") || "Игрок",
  });
}

function profileText(user: User) {
  const cigarettes = user.inventory.filter((owned) => owned.equipped && item(owned.catalogId)?.passivePerSecond);
  const passive = cigarettes.length ? `\nПассивный доход: +${money("100000")}/сек` : "";
  return [
    `RP CITY · Профиль`,
    ``,
    `Игрок: ${userName(user)}`,
    `Ваш ID: ${user.userId}`,
    `Уровень: ${user.level} (${user.exp} exp / ${xpToNext(user.level)})`,
    `Баланс: ${money(user.coins)}`,
    `Донат: ${donate(user.donate)}`,
    `Инвентарь: ${user.inventory.length} предметов`,
    `Автомобили: ${user.cars.length}`,
    `Дома: ${user.houses.length}`,
    passive,
  ].join("\n");
}

async function sendPropertyPhotos(chatId: number, user: User) {
  const properties = [...user.cars, ...user.houses]
    .map((owned) => item(owned.catalogId))
    .filter((product): product is CatalogItem => Boolean(product));

  if (!properties.length) return;
  await telegram.sendMessage(chatId, "Мои автомобили и дома:");
  for (const product of properties.slice(0, 8)) {
    try {
      await telegram.sendPhoto(chatId, productPhoto(product), product.name);
    } catch (error: unknown) {
      logTelegramError(error, "send property photo " + product.id);
      await telegram.sendMessage(chatId, product.name);
    }
  }
  if (properties.length > 8) {
    await telegram.sendMessage(chatId, "Показаны первые 8 объектов из " + properties.length + ". Полный список — в разделе «Моё имущество».");
  }
}

async function sendProfile(chatId: number, user: User) {
  const markup = inline([
    [{ text: "Инвентарь", callback_data: "inventory" }, { text: "Промокод", callback_data: "promo" }],
    [{ text: "Моё имущество", callback_data: "property" }],
    [{ text: "👀 Смотреть профиль игрока", callback_data: "profile:other" }],
  ]);
  try {
    // Always send the deterministic rendered avatar first. Property photos
    // belong only to the property screens, never to a profile screen.
    await telegram.sendPhoto(chatId, renderCharacter(user), "Персонаж RP CITY");
  } catch (error: unknown) {
    logTelegramError(error, "send rendered profile character");
    await telegram.sendMessage(chatId, "Персонаж RP CITY");
  }
  await telegram.sendMessage(chatId, profileText(user), markup);
  await telegram.sendMessage(chatId, "Выберите действие кнопками внизу.", mainKeyboard(isAdmin(user.telegramId)));
}

async function showOtherProfile(chatId: number, viewer: User, targetId: number) {
  const target = store.findUserById(targetId);
  if (!target) {
    await sendText(chatId, "Игрок с таким ID не найден.", viewer.telegramId);
    return;
  }
  const equipped = target.inventory.filter((owned) => owned.equipped);
  const inventory = target.inventory.length ? target.inventory.map(itemLine).join("\n") : "пусто";
  const properties = [...target.cars.map((owned) => `🚗 ${itemLine(owned)}`), ...target.houses.map((owned) => `🏠 ${itemLine(owned)}`)];
  const text = [
    `Публичный профиль`,
    `Игрок: ${userName(target)}`,
    `Внутренний ID бота: ${target.userId}`,
    `Уровень: ${target.level}`,
    ``,
    `Одежда надета: ${equipped.length ? equipped.map(itemLine).join("\n") : "ничего"}`,
    ``,
    `Инвентарь (${target.inventory.length}):\n${inventory}`,
    ``,
    `Имущество (${target.cars.length + target.houses.length}):\n${properties.length ? properties.join("\n") : "ничего"}`,
  ].join("\n");
  const markup = inline([
    [{ text: `Инвентарь (${target.inventory.length})`, callback_data: `public:inventory:${target.userId}` }],
    [{ text: `Имущество (${target.cars.length + target.houses.length})`, callback_data: `public:property:${target.userId}` }],
    [{ text: "Назад в мой профиль", callback_data: "back:profile" }],
  ]);
  try {
    await telegram.sendPhoto(chatId, renderCharacter(target), "Персонаж игрока");
  } catch (error: unknown) {
    logTelegramError(error, "send rendered public profile character");
    await telegram.sendMessage(chatId, "Персонаж игрока");
  }
  await telegram.sendMessage(chatId, text, markup);
  await telegram.sendMessage(chatId, "Профиль открыт для просмотра.", mainKeyboard(isAdmin(viewer.telegramId)));
}

async function showPublicInventory(chatId: number, viewer: User, targetId: number) {
  const target = store.findUserById(targetId);
  if (!target) {
    await sendText(chatId, "Игрок с таким ID не найден.", viewer.telegramId);
    return;
  }
  const inventory = target.inventory.length
    ? target.inventory.map((owned) => `• ${itemLine(owned)}`).join("\n")
    : "пусто";
  await telegram.sendMessage(
    chatId,
    `Инвентарь игрока ID ${target.userId} · ${userName(target)}\n\n${inventory}`,
    inline([
      [{ text: "К профилю игрока", callback_data: `public:profile:${target.userId}` }],
      [{ text: "Назад в мой профиль", callback_data: "back:profile" }],
    ]),
  );
}

async function showPublicProperty(chatId: number, viewer: User, targetId: number) {
  const target = store.findUserById(targetId);
  if (!target) {
    await sendText(chatId, "Игрок с таким ID не найден.", viewer.telegramId);
    return;
  }
  const properties = [
    ...target.cars.map((owned) => `🚗 ${itemLine(owned)}`),
    ...target.houses.map((owned) => `🏠 ${itemLine(owned)}`),
  ];
  await telegram.sendMessage(
    chatId,
    `Имущество игрока ID ${target.userId} · ${userName(target)}\n\n${properties.length ? properties.join("\n") : "ничего"}`,
    inline([
      [{ text: "К профилю игрока", callback_data: `public:profile:${target.userId}` }],
      [{ text: "Назад в мой профиль", callback_data: "back:profile" }],
    ]),
  );
  await sendPropertyPhotos(chatId, target);
}

async function showStore(chatId: number, telegramId: string) {
  await sendText(chatId, "Общий магазин\n\nВыберите раздел:", telegramId);
  await telegram.sendMessage(
    chatId,
    "Категории товаров",
    inline([
      [{ text: "Одежда", callback_data: "shop:clothing" }],
      [{ text: "Автомобили", callback_data: "shop:cars" }, { text: "Дома", callback_data: "shop:houses" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function showProduct(chatId: number, product: CatalogItem) {
  const price = product.kind === "donate" ? donate(product.donatePrice ?? "0") : money(product.price);
  const text = `${product.name}\nКатегория: ${kindLabel(product)}\nЦена: ${price}\nID предмета: ${product.id}`;
  const buyCallback = product.kind === "donate" ? `buydonate:${product.id}` : `buy:${product.id}`;
  const backCallback = product.kind === "donate" ? "catalog:donate:0" : `catalog:${product.kind}:0`;
  try {
    await telegram.sendPhoto(chatId, productPhoto(product), text, inline([
      [{ text: "Купить", callback_data: buyCallback }],
      [{ text: "Назад к каталогу", callback_data: backCallback }],
    ]));
  } catch (error: unknown) {
    logTelegramError(error, "send real product photo");
    await telegram.sendMessage(chatId, text, inline([
      [{ text: "Купить", callback_data: buyCallback }],
      [{ text: "Назад к каталогу", callback_data: backCallback }],
    ]));
  }
}

async function showCatalog(chatId: number, kind: CatalogKind, page = 0) {
  const products = kind === "donate" ? catalog.filter((entry) => entry.kind === kind) : store.itemsByKind(kind);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const visible = products.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const lines = visible.map((product) => `${product.name}\nЦена: ${product.kind === "donate" ? donate(product.donatePrice ?? "0") : money(product.price)} · ID ${product.id}`);
  const rows = visible.map((product) => [
    { text: `Фото · ${product.name.slice(0, 18)}`, callback_data: `product:${product.id}` },
    { text: "Купить", callback_data: product.kind === "donate" ? `buydonate:${product.id}` : `buy:${product.id}` },
  ]);
  const navigation: { text: string; callback_data: string }[] = [];
  if (safePage > 0) navigation.push({ text: "←", callback_data: `catalog:${kind}:${safePage - 1}` });
  navigation.push({ text: `${safePage + 1}/${totalPages}`, callback_data: "noop" });
  if (safePage < totalPages - 1) navigation.push({ text: "→", callback_data: `catalog:${kind}:${safePage + 1}` });
  rows.push(navigation);
  rows.push([{ text: "К общему магазину", callback_data: "shop:menu" }]);
  await telegram.sendMessage(
    chatId,
    `${categoryLabels[kind]}\n\n${lines.join("\n\n")}`,
    inline(rows),
  );
}

async function showClothing(chatId: number) {
  await telegram.sendMessage(
    chatId,
    "Одежда\n\nВыберите категорию:",
    inline([
      [{ text: "Кроссовки", callback_data: "shop:sneakers" }, { text: "Майки", callback_data: "shop:shirts" }],
      [{ text: "Штаны", callback_data: "shop:pants" }, { text: "Куртки", callback_data: "shop:jackets" }],
      [{ text: "Головные уборы", callback_data: "shop:hats" }, { text: "Аксессуары", callback_data: "shop:accessories" }],
      [{ text: "Назад", callback_data: "shop:menu" }],
    ]),
  );
}

async function buyProduct(chatId: number, user: User, product: CatalogItem) {
  if (product.hidden) {
    await sendText(chatId, "Этот предмет нельзя купить в магазине.", user.telegramId);
    return;
  }
  const price = BigInt(product.price);
  if (BigInt(user.coins) < price) {
    await sendText(chatId, `Недостаточно денег.\nНужно: ${money(product.price)}\nУ вас: ${money(user.coins)}`, user.telegramId);
    return;
  }
  user.coins = (BigInt(user.coins) - price).toString();
  const owned = await store.addOwned(user, product.id);
  await sendText(chatId, `Покупка успешна.\n${product.name}\nID предмета: ${product.id}\nВаш ID экземпляра: ${owned.instanceId}`, user.telegramId);
}

async function showInventory(chatId: number, user: User) {
  if (!user.inventory.length) {
    await sendText(chatId, "Инвентарь пуст. Загляните в общий магазин.", user.telegramId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    `Инвентарь · ${user.inventory.length} предметов`,
    inline([
      ...user.inventory.map((owned) => [{ text: itemLine(owned).slice(0, 60), callback_data: `invitem:${owned.instanceId}` }]),
      [{ text: "Назад в профиль", callback_data: "back:profile" }],
    ]),
  );
}

async function showInventoryItem(chatId: number, user: User, instanceId: string) {
  const owned = user.inventory.find((entry) => entry.instanceId === instanceId);
  if (!owned) {
    await sendText(chatId, "Предмет не найден в вашем инвентаре.", user.telegramId);
    return;
  }
  const product = item(owned.catalogId);
  if (!product) return;
  await telegram.sendMessage(
    chatId,
    `${product.name}\nID предмета: ${product.id}\nID экземпляра: ${owned.instanceId}\nСтатус: ${owned.equipped ? "надето" : "снято"}${product.passivePerSecond ? "\nБонус: +100 000 монет в секунду" : ""}`,
    inline([
      [{ text: owned.equipped ? "Снять" : "Надеть", callback_data: `${owned.equipped ? "unequip" : "equip"}:${instanceId}` }],
      [{ text: "Назад в инвентарь", callback_data: "inventory" }],
    ]),
  );
}

async function showProperty(chatId: number, user: User) {
  await telegram.sendMessage(
    chatId,
    "Моё имущество",
    inline([
      [{ text: `Мои автомобили (${user.cars.length})`, callback_data: "property:cars" }],
      [{ text: `Мои дома (${user.houses.length})`, callback_data: "property:houses" }],
      [{ text: "Назад в профиль", callback_data: "back:profile" }],
    ]),
  );
}

async function showPropertyList(chatId: number, user: User, propertyType: "cars" | "houses") {
  const assets = propertyType === "cars" ? user.cars : user.houses;
  if (!assets.length) {
    await sendText(chatId, propertyType === "cars" ? "У вас пока нет автомобилей." : "У вас пока нет домов.", user.telegramId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    propertyType === "cars" ? "Мои автомобили" : "Мои дома",
    inline([
      ...assets.map((owned) => [{ text: item(owned.catalogId)?.name ?? "Неизвестно", callback_data: `property:item:${owned.instanceId}` }]),
      [{ text: "Назад к имуществу", callback_data: "property" }],
    ]),
  );
}

async function showPropertyItem(chatId: number, user: User, instanceId: string) {
  const owned = store.getOwned(user, instanceId);
  const product = owned ? item(owned.catalogId) : undefined;
  if (!owned || !product || !["cars", "houses"].includes(product.kind)) {
    await sendText(chatId, "Имущество не найдено.", user.telegramId);
    return;
  }
  const text = `${product.name}\nID предмета: ${product.id}\nСтоимость покупки: ${money(product.price)}\nЦена продажи государству: ${money((BigInt(product.price) * 70n) / 100n)}`;
  try {
    await telegram.sendPhoto(chatId, productPhoto(product), text, inline([
      [{ text: "Продать государству (-30%)", callback_data: `sellproperty:${instanceId}` }],
      [{ text: "Назад к имуществу", callback_data: "property" }],
    ]));
  } catch (error: unknown) {
    logTelegramError(error, "send property image");
    await telegram.sendMessage(chatId, text, inline([
      [{ text: "Продать государству (-30%)", callback_data: `sellproperty:${instanceId}` }],
      [{ text: "Назад к имуществу", callback_data: "property" }],
    ]));
  }
}

async function showDonate(chatId: number, user: User) {
  await telegram.sendMessage(
    chatId,
    `Донат-магазин\nВаш баланс: ${donate(user.donate)}\n\nПока доступна одна позиция:`,
    inline([
      [{ text: "Донат-аксессуары", callback_data: "catalog:donate:0" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function buyDonateProduct(chatId: number, user: User, product: CatalogItem) {
  const price = BigInt(product.donatePrice ?? "0");
  if (BigInt(user.donate) < price) {
    await sendText(chatId, `Недостаточно доната. Нужно: ${donate(price)}.`, user.telegramId);
    return;
  }
  user.donate = (BigInt(user.donate) - price).toString();
  await store.addOwned(user, product.id);
  await sendText(chatId, `Покупка за донат успешна: ${product.name}.`, user.telegramId);
}

async function showCasino(chatId: number, user: User) {
  await telegram.sendMessage(
    chatId,
    `Казино «Кости»\n\nСтавка от ${money("10000")} до ${money("1000000000000000000")}.\nВы вводите сумму, затем бот бросает кости за вас и за дилера. Победитель получает x2 ставки.`,
    inline([
      [{ text: "Поставить ставку", callback_data: "casino:stake" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function playCasino(chatId: number, user: User, text: string) {
  const stake = amountFromText(text);
  if (!stake || stake < 10_000n || stake > 1_000_000_000_000_000_000n) {
    await sendText(chatId, "Введите ставку целым числом от 10 000 до 1 000 000 000 000 000 000.", user.telegramId);
    return;
  }
  if (BigInt(user.coins) < stake) {
    await sendText(chatId, "У вас недостаточно монет для этой ставки.", user.telegramId);
    return;
  }
  const player = Math.floor(Math.random() * 6) + 1;
  const dealer = Math.floor(Math.random() * 6) + 1;
  if (player > dealer) user.coins = (BigInt(user.coins) + stake).toString();
  else if (player < dealer) user.coins = (BigInt(user.coins) - stake).toString();
  await store.updateUser(user);
  const result = player > dealer ? `Вы выиграли ${money(stake)}.` : player < dealer ? `Вы проиграли ${money(stake)}.` : "Ничья, ставка возвращена.";
  await sendText(chatId, `Ваш кубик: ${player}\nКубик дилера: ${dealer}\n\n${result}\nБаланс: ${money(user.coins)}`, user.telegramId);
}

async function showForbes(chatId: number) {
  const top = store.users
    .map((user) => ({ user, coins: BigInt(user.coins || "0") }))
    .sort((a, b) => (a.coins === b.coins ? 0 : a.coins > b.coins ? -1 : 1))
    .slice(0, 10);
  const lines = top.length
    ? top.map(({ user, coins }, index) =>
        `${index + 1}. ${userName(user)} · ID ${user.userId}\n   Баланс: ${money(coins)}`,
      )
    : ["Пока никто не зарегистрирован."];
  await telegram.sendMessage(chatId, `FORBES RP CITY · ТОП 10\n\n${lines.join("\n")}`, inline([
    [{ text: "Обновить", callback_data: "forbes" }],
    [{ text: "Назад", callback_data: "back:profile" }],
  ]));
}

async function showJobs(chatId: number, user: User) {
  const remaining = Math.max(0, 30 - (Date.now() - Number(user.lastWorkAt)) / 1000);
  await telegram.sendMessage(
    chatId,
    `Работы\n\nЗа выполненную работу: +10 000 монет и +20 exp.\nПерерыв между заданиями: 30 секунд.${remaining ? `\nДо следующей работы: ${Math.ceil(remaining)} сек.` : ""}`,
    inline([
      [{ text: "Шахта", callback_data: "job:mine" }, { text: "Курьер", callback_data: "job:courier" }],
      [{ text: "Такси", callback_data: "job:taxi" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function doJob(chatId: number, user: User, job: string) {
  const now = Date.now();
  if (now - Number(user.lastWorkAt) < 30_000) {
    await sendText(chatId, `Вы устали. Подождите ${Math.ceil((30_000 - (now - Number(user.lastWorkAt))) / 1000)} сек.`, user.telegramId);
    return;
  }
  user.lastWorkAt = String(now);
  user.coins = (BigInt(user.coins) + 10_000n).toString();
  const levelUp = addExp(user, 20);
  await store.updateUser(user);
  await sendText(chatId, `Работа «${job}» выполнена.\nНачислено: ${money("10000")} и 20 exp.${levelUp ? `\nПоздравляем! Новый уровень: ${user.level}.` : ""}\nБаланс: ${money(user.coins)}`, user.telegramId);
}

function clanForUser(user: User) {
  return user.clanId ? store.clans.find((clan) => clan.id === user.clanId) : undefined;
}

function clanRank(clan: Clan, userId: number) {
  const saved = clan.memberRanks?.[String(userId)];
  if (saved) return Math.max(1, Math.min(10, saved));
  return clan.ownerId === userId ? 10 : 1;
}

function clanRankName(clan: Clan, rank: number) {
  return clan.rankNames?.[rank - 1] ?? `Ранг ${rank}`;
}

function clanCanInvite(clan: Clan, userId: number) {
  return clanRank(clan, userId) >= 7;
}

function clanCanManage(clan: Clan, userId: number) {
  return clanRank(clan, userId) >= 9;
}

async function showClanMembers(chatId: number, user: User) {
  sessions.delete(user.telegramId);
  const clan = clanForUser(user);
  if (!clan) {
    await sendText(chatId, "Сначала вступите в клан.", user.telegramId);
    return;
  }
  const lines = clan.memberIds.map((memberId) => {
    const member = store.findUserById(memberId);
    const rank = clanRank(clan, memberId);
    return `${memberId} · ${member ? userName(member) : "Игрок"} · TG: ${member?.telegramId ?? "не найден"}\n   Ранг ${rank}: ${clanRankName(clan, rank)}`;
  });
  await telegram.sendMessage(
    chatId,
    `Состав клана «${clan.name}»\n\n${lines.join("\n\n") || "В клане пока нет участников."}`,
    inline([
      [{ text: "Назад в клан", callback_data: "clans" }],
    ]),
  );
}

async function showClanInvites(chatId: number, user: User) {
  sessions.delete(user.telegramId);
  const invites = store.clanInvites.filter((invite) => invite.targetId === user.userId && invite.status === "pending");
  if (!invites.length) {
    await sendText(chatId, "Новых приглашений в клан нет.", user.telegramId);
    return;
  }
  const rows = invites.map((invite) => {
    const clan = store.clans.find((entry) => entry.id === invite.clanId);
    return [
      { text: `Принять «${clan?.name ?? invite.clanId}»`, callback_data: `clan:invite:accept:${invite.id}` },
      { text: "Отказаться", callback_data: `clan:invite:decline:${invite.id}` },
    ];
  });
  await telegram.sendMessage(chatId, "Вам отправили приглашение в клан:", inline([
    ...rows,
    [{ text: "Назад", callback_data: "clans" }],
  ]));
}

async function showClanChat(chatId: number, user: User) {
  const clan = clanForUser(user);
  if (!clan) {
    sessions.delete(user.telegramId);
    await sendText(chatId, "Вы не состоите в клане.", user.telegramId);
    return;
  }
  const messages = store.clanMessages
    .filter((message) => message.clanId === clan.id)
    .slice(-30);
  const text = messages.length
    ? messages.map((message) => {
        const author = store.findUserById(message.userId);
        return `${author ? userName(author) : `ID ${message.userId}`} · ${new Date(message.createdAt).toLocaleString("ru-RU")}\n${message.text}`;
      }).join("\n\n")
    : "В чате пока тихо. Напишите первое сообщение.";
  await telegram.sendMessage(
    chatId,
    `Чат клана «${clan.name}»\n\n${text}`,
    inline([
      [{ text: "Выйти из чата клана", callback_data: "clan:chat:leave" }],
      [{ text: "Обновить чат", callback_data: "clan:chat:refresh" }],
      [{ text: "Назад в клан", callback_data: "clans" }],
    ]),
  );
}

async function showClans(chatId: number, user: User) {
  const own = clanForUser(user);
  const pendingInvites = store.clanInvites.filter((invite) => invite.targetId === user.userId && invite.status === "pending");
  if (!own) {
    const list = store.clans.length
      ? store.clans.slice(0, 12).map((clan) => `${clan.id} · ${clan.name} · ${clan.memberIds.length} участников`).join("\n")
      : "Кланов пока нет.";
    await telegram.sendMessage(
      chatId,
      `Кланы\n\n${list}\n\nСоздание клана стоит ${money("1000000000")}.${pendingInvites.length ? `\nНовых приглашений: ${pendingInvites.length}` : ""}`,
      inline([
        [{ text: "Создать клан", callback_data: "clan:create" }],
        ...(pendingInvites.length ? [[{ text: `Принять в клан (${pendingInvites.length})`, callback_data: "clan:invites" }]] : []),
        [{ text: "Обновить", callback_data: "clans" }],
        [{ text: "Назад", callback_data: "back:profile" }],
      ]),
    );
    return;
  }

  const rank = clanRank(own, user.userId);
  const inChat = sessions.get(user.telegramId)?.type === "clanChat";
  const rows: InlineKeyboardButton[][] = [
    [{ text: inChat ? "Выйти из чата клана" : "Чат клана", callback_data: inChat ? "clan:chat:leave" : "clan:chat" }],
    [{ text: "Состав клана", callback_data: "clan:members" }],
    ...(pendingInvites.length ? [[{ text: `Принять в клан (${pendingInvites.length})`, callback_data: "clan:invites" }]] : []),
    ...(clanCanInvite(own, user.userId) ? [[{ text: "Принять игрока в клан", callback_data: "clan:invite" }]] : []),
    ...(clanCanManage(own, user.userId) ? [
      [{ text: "Повысить/изменить ранг", callback_data: "clan:promote" }],
      [{ text: "Назвать ранг 1–10", callback_data: "clan:rename" }],
      [{ text: "Выгнать из клана", callback_data: "clan:kick" }],
    ] : []),
    [{ text: "Выйти из клана", callback_data: "clan:leave" }],
    [{ text: "Обновить", callback_data: "clans" }],
    [{ text: "Назад", callback_data: "back:profile" }],
  ];
  await telegram.sendMessage(
    chatId,
    `Клан «${own.name}» · ${own.id}\nВаш ранг: ${rank} · ${clanRankName(own, rank)}\nУчастников: ${own.memberIds.length}\n\nПрава: ${rank >= 9 ? "управление составом и рангами" : rank >= 7 ? "приглашение игроков" : "участник"}`,
    inline(rows),
  );
}

async function createClan(chatId: number, user: User, name: string) {
  const clean = name.trim().slice(0, 32);
  if (clean.length < 3) {
    await sendText(chatId, "Название должно быть от 3 до 32 символов.", user.telegramId);
    return;
  }
  if (user.clanId) {
    await sendText(chatId, "Сначала выйдите из текущего клана.", user.telegramId);
    return;
  }
  if (BigInt(user.coins) < 1_000_000_000n) {
    await sendText(chatId, "Для создания клана нужен 1 000 000 000 монет.", user.telegramId);
    return;
  }
  user.coins = (BigInt(user.coins) - 1_000_000_000n).toString();
  const clan = await store.addClan(clean, user.userId);
  user.clanId = clan.id;
  await store.updateUser(user);
  await sendText(chatId, `Клан создан.\nНазвание: ${clan.name}\nID клана: ${clan.id}`, user.telegramId);
}

async function joinClan(chatId: number, user: User, clanId: string) {
  const clan = store.clans.find((entry) => entry.id.toLowerCase() === clanId.toLowerCase());
  if (!clan) {
    await sendText(chatId, "Клан с таким ID не найден.", user.telegramId);
    return;
  }
  if (user.clanId) {
    await sendText(chatId, "Вы уже состоите в клане.", user.telegramId);
    return;
  }
  await store.addClanMember(clan, user.userId);
  user.clanId = clan.id;
  await store.updateUser(user);
  await sendText(chatId, `Вы вступили в клан «${clan.name}».`, user.telegramId);
}

async function inviteToClan(chatId: number, user: User, targetIdText: string) {
  const clan = clanForUser(user);
  const targetId = Number(targetIdText.trim());
  const target = store.findUserById(targetId);
  if (!clan || !clanCanInvite(clan, user.userId)) {
    await sendText(chatId, "Приглашать в клан могут только участники 7–10 ранга.", user.telegramId);
    return;
  }
  if (!target || target.userId === user.userId) {
    await sendText(chatId, "Игрок с таким ID не найден.", user.telegramId);
    return;
  }
  if (target.clanId) {
    await sendText(chatId, "Этот игрок уже состоит в клане.", user.telegramId);
    return;
  }
  if (store.clanInvites.some((invite) => invite.clanId === clan.id && invite.targetId === target.userId && invite.status === "pending")) {
    await sendText(chatId, "Этому игроку уже отправлено приглашение.", user.telegramId);
    return;
  }
  const invite = await store.addClanInvite({ clanId: clan.id, inviterId: user.userId, targetId: target.userId });
  await sendText(chatId, `Приглашение #${invite.id} отправлено игроку ID ${target.userId}.`, user.telegramId);
  await telegram.sendMessage(
    Number(target.telegramId),
    `Вам отправили приглашение в клан «${clan.name}».\nОтправитель: ${userName(user)} · ID ${user.userId}`,
    inline([[
      { text: "Принять", callback_data: `clan:invite:accept:${invite.id}` },
      { text: "Отказаться", callback_data: `clan:invite:decline:${invite.id}` },
    ]]),
  );
}

async function resolveClanInvite(chatId: number, user: User, inviteId: number, accept: boolean) {
  const invite = store.clanInvites.find((entry) => entry.id === inviteId && entry.targetId === user.userId && entry.status === "pending");
  if (!invite) {
    await sendText(chatId, "Приглашение уже недействительно.", user.telegramId);
    return;
  }
  const clan = store.clans.find((entry) => entry.id === invite.clanId);
  if (!clan) {
    invite.status = "cancelled";
    await store.updateClanInvite(invite);
    await sendText(chatId, "Клан больше не существует.", user.telegramId);
    return;
  }
  if (!accept) {
    invite.status = "declined";
    await store.updateClanInvite(invite);
    await sendText(chatId, "Вы отказались от приглашения.", user.telegramId);
    return;
  }
  if (user.clanId) {
    await sendText(chatId, "Сначала выйдите из текущего клана.", user.telegramId);
    return;
  }
  invite.status = "accepted";
  await store.updateClanInvite(invite);
  await store.addClanMember(clan, user.userId, 1);
  user.clanId = clan.id;
  await store.updateUser(user);
  await sendText(chatId, `Вы вступили в клан «${clan.name}».`, user.telegramId);
  const inviter = store.findUserById(invite.inviterId);
  if (inviter) await sendText(Number(inviter.telegramId), `${userName(user)} принял приглашение в клан.`, inviter.telegramId);
}

async function promoteClanMember(chatId: number, user: User, targetIdText: string) {
  const clan = clanForUser(user);
  const targetId = Number(targetIdText.trim());
  const target = store.findUserById(targetId);
  if (!clan || !clanCanManage(clan, user.userId)) {
    await sendText(chatId, "Повышать ранг могут только участники 9–10 ранга.", user.telegramId);
    return;
  }
  if (!target || !clan.memberIds.includes(target.userId) || target.userId === clan.ownerId) {
    await sendText(chatId, "Участник клана с таким ID не найден или это лидер.", user.telegramId);
    return;
  }
  sessions.set(user.telegramId, { type: "clanRankValue", targetId });
  await sendText(chatId, `Введите новый ранг для игрока ID ${targetId} — целое число от 1 до 10.`, user.telegramId);
}

async function setClanMemberRank(chatId: number, user: User, targetId: number, rankText: string) {
  const clan = clanForUser(user);
  const rank = Number(rankText.trim());
  const target = store.findUserById(targetId);
  if (!clan || !target || !clanCanManage(clan, user.userId) || !clan.memberIds.includes(targetId) || !Number.isInteger(rank) || rank < 1 || rank > 10) {
    await sendText(chatId, "Введите ранг от 1 до 10 для участника этого клана.", user.telegramId);
    return;
  }
  if (targetId === clan.ownerId || rank >= clanRank(clan, user.userId)) {
    await sendText(chatId, "Нельзя назначить участнику ранг не ниже своего или изменить ранг лидера.", user.telegramId);
    return;
  }
  await store.setClanMemberRank(clan, targetId, rank);
  sessions.delete(user.telegramId);
  await sendText(chatId, `Игроку ID ${targetId} назначен ранг ${rank}: ${clanRankName(clan, rank)}.`, user.telegramId);
  await sendText(Number(target.telegramId), `В клане «${clan.name}» вам назначили ранг ${rank}: ${clanRankName(clan, rank)}.`, target.telegramId);
}

async function saveClanRankName(chatId: number, user: User, rank: number, name: string) {
  const clan = clanForUser(user);
  const clean = name.trim().slice(0, 32);
  if (!clan || !clanCanManage(clan, user.userId) || clean.length < 2) {
    await sendText(chatId, "Название ранга должно быть от 2 до 32 символов.", user.telegramId);
    return;
  }
  await store.setClanRankName(clan, rank, clean);
  sessions.delete(user.telegramId);
  await sendText(chatId, `Название ранга ${rank} изменено на «${clean}».`, user.telegramId);
}

async function kickFromClan(chatId: number, user: User, targetIdText: string) {
  const clan = clanForUser(user);
  const targetId = Number(targetIdText.trim());
  const target = store.findUserById(targetId);
  if (!clan || !clanCanManage(clan, user.userId) || !target || !clan.memberIds.includes(targetId) || targetId === clan.ownerId) {
    await sendText(chatId, "Можно выгнать только обычного участника своего клана.", user.telegramId);
    return;
  }
  if (clanRank(clan, targetId) >= clanRank(clan, user.userId)) {
    await sendText(chatId, "Нельзя выгнать участника с равным или более высоким рангом.", user.telegramId);
    return;
  }
  await store.removeClanMember(clan, targetId);
  delete target.clanId;
  await store.updateUser(target);
  sessions.delete(user.telegramId);
  await sendText(chatId, `Игрок ID ${targetId} выгнан из клана.`, user.telegramId);
  await sendText(Number(target.telegramId), `Вас выгнали из клана «${clan.name}».`, target.telegramId);
}

async function leaveClan(chatId: number, user: User) {
  const clan = clanForUser(user);
  if (!clan) {
    await sendText(chatId, "Вы не состоите в клане.", user.telegramId);
    return;
  }
  if (clan.ownerId === user.userId) {
    await sendText(chatId, "Лидер не может выйти из клана. Сначала передайте лидерство.", user.telegramId);
    return;
  }
  await store.removeClanMember(clan, user.userId);
  delete user.clanId;
  sessions.delete(user.telegramId);
  await store.updateUser(user);
  await sendText(chatId, `Вы вышли из клана «${clan.name}».`, user.telegramId);
}

async function writeClanMessage(chatId: number, user: User, text: string) {
  const clan = clanForUser(user);
  const clean = text.trim().slice(0, 500);
  if (!clan || !clean) {
    await sendText(chatId, "Сообщение не может быть пустым.", user.telegramId);
    return;
  }
  await store.addClanMessage(clan.id, user.userId, clean);
  for (const memberId of clan.memberIds) {
    if (memberId === user.userId) continue;
    const member = store.findUserById(memberId);
    if (!member) continue;
    try {
      await telegram.sendMessage(
        Number(member.telegramId),
        `💬 ${clan.name} · ${userName(user)}:\n${clean}`,
        inline([[{ text: "Открыть чат клана", callback_data: "clan:chat" }]]),
      );
    } catch (error: unknown) {
      logTelegramError(error, `clan message to ${member.telegramId}`);
    }
  }
  await showClanChat(chatId, user);
}

function listingText(listing: Listing) {
  const product = item(listing.item.catalogId);
  return product ? `${product.name} · ${kindLabel(product)} · ID ${product.id}\nЦена: ${money(listing.price)}\nПродавец ID: ${listing.sellerId}${listing.item.equipped ? "\nСостояние: было надето" : ""}` : "Неизвестный предмет";
}

async function showMarket(chatId: number, user: User) {
  const listings = store.listings.slice(0, 20);
  const text = listings.length
    ? `Торговая площадка\n\n${listings.map((listing) => `${listing.sellerId === user.userId ? "ВАШЕ ОБЪЯВЛЕНИЕ" : "ОБЪЯВЛЕНИЕ"} #${listing.id}\n${listingText(listing)}`).join("\n\n")}`
    : "Торговая площадка пока пуста.";
  const listingButtons = listings.map((listing) => [
    {
      text: listing.sellerId === user.userId ? `Снять своё #${listing.id}` : `Купить #${listing.id}`,
      callback_data: listing.sellerId === user.userId ? `market:cancel:${listing.id}` : `market:buy:${listing.id}`,
    },
  ]);
  await telegram.sendMessage(
    chatId,
    text,
    inline([
      ...listingButtons,
      [{ text: "Продать аксессуар/одежду", callback_data: "market:sell:item" }],
      [{ text: "Продать автомобиль", callback_data: "market:sell:car" }, { text: "Продать дом", callback_data: "market:sell:house" }],
      [{ text: "Обновить", callback_data: "market" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function showMarketAssets(chatId: number, user: User, assetType: "item" | "car" | "house") {
  const assets = assetType === "item" ? user.inventory : assetType === "car" ? user.cars : user.houses;
  if (!assets.length) {
    await sendText(chatId, "У вас нет подходящего имущества для продажи.", user.telegramId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    "Выберите имущество для выставления:",
    inline([
      ...assets.map((owned) => [{ text: item(owned.catalogId)?.name ?? "Неизвестно", callback_data: `market:select:${assetType}:${owned.instanceId}` }]),
      [{ text: "Назад", callback_data: "market" }],
    ]),
  );
}

async function listAsset(chatId: number, user: User, assetType: "item" | "car" | "house", instanceId: string, text: string) {
  const price = amountFromText(text);
  if (!price || price <= 0n) {
    await sendText(chatId, "Введите положительную цену целым числом.", user.telegramId);
    return;
  }
  const list = assetType === "item" ? user.inventory : assetType === "car" ? user.cars : user.houses;
  const owned = list.find((entry) => entry.instanceId === instanceId);
  if (!owned) {
    await sendText(chatId, "Имущество уже отсутствует у вас.", user.telegramId);
    return;
  }
  await store.removeOwned(user, owned);
  const listing = await store.addListing({ sellerId: user.userId, assetType, item: owned, price: price.toString() });
  await sendText(chatId, `Выставлено на площадку под номером #${listing.id}.\nЦена: ${money(listing.price)}`, user.telegramId);
}

async function buyListing(chatId: number, user: User, listingId: number) {
  const listing = store.listings.find((entry) => entry.id === listingId);
  if (!listing || listing.sellerId === user.userId) {
    await sendText(chatId, "Объявление не найдено.", user.telegramId);
    return;
  }
  if (BigInt(user.coins) < BigInt(listing.price)) {
    await sendText(chatId, "Недостаточно монет для покупки.", user.telegramId);
    return;
  }
  const seller = store.findUserById(listing.sellerId);
  if (!seller) return;
  user.coins = (BigInt(user.coins) - BigInt(listing.price)).toString();
  seller.coins = (BigInt(seller.coins) + BigInt(listing.price)).toString();
  await store.removeListing(listingId);
  await store.addOwned(user, listing.item.catalogId);
  await store.updateUser(seller);
  await sendText(chatId, `Покупка на площадке успешна: ${item(listing.item.catalogId)?.name ?? "предмет"}.\nСписано: ${money(listing.price)}`, user.telegramId);
  await sendText(Number(seller.telegramId), `Ваше объявление #${listing.id} купили за ${money(listing.price)}.`, seller.telegramId);
}

async function cancelListing(chatId: number, user: User, listingId: number) {
  const listing = store.listings.find((entry) => entry.id === listingId && entry.sellerId === user.userId);
  if (!listing) {
    await sendText(chatId, "Ваше объявление не найдено.", user.telegramId);
    return;
  }
  await store.removeListing(listingId);
  await store.restoreOwned(user, listing.item);
  await sendText(chatId, `Объявление #${listing.id} снято. Предмет возвращён в ваш инвентарь/имущество.`, user.telegramId);
}

function assetsForTrade(user: User, _kind: "any" | "items" | "property") {
  // "any" is the default exchange mode: a cigarette can be exchanged for a cap,
  // a car for a house, or any other combination of owned assets.
  return [...user.inventory, ...user.cars, ...user.houses];
}

async function showExchange(chatId: number, user: User) {
  await telegram.sendMessage(
    chatId,
    "Обмен\n\nМожно обменять любой свой предмет на любой предмет другого игрока: папиросу на кепку, автомобиль на дом, одежду на аксессуар и так далее.",
    inline([
      [{ text: "Создать обмен", callback_data: "exchange:any" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function createTrade(chatId: number, user: User, kind: "any" | "items" | "property", targetIdText: string) {
  const targetId = Number(targetIdText.trim());
  const target = store.findUserById(targetId);
  if (!target || target.userId === user.userId) {
    await sendText(chatId, "Игрок с таким ID не найден.", user.telegramId);
    return;
  }
  const assets = assetsForTrade(user, kind);
  if (!assets.length) {
    await sendText(chatId, "У вас нет имущества этого типа для обмена.", user.telegramId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    `Выберите ваш предмет для обмена с игроком ID ${target.userId}:`,
    inline(assets.map((owned) => [{ text: item(owned.catalogId)?.name ?? "Неизвестно", callback_data: `trade:offer:${kind}:${target.userId}:${owned.instanceId}` }])),
  );
}

async function offerTrade(chatId: number, user: User, kind: "any" | "items" | "property", targetId: number, instanceId: string) {
  const target = store.findUserById(targetId);
  const owned = assetsForTrade(user, kind).find((entry) => entry.instanceId === instanceId);
  if (!target || !owned) {
    await sendText(chatId, "Предмет или игрок уже недоступен.", user.telegramId);
    return;
  }
  const trade = await store.addTrade({
    initiatorId: user.userId,
    targetId,
    kind,
    initiatorAsset: owned,
    initiatorReady: false,
    targetReady: false,
    status: "pending",
    extraPayment: "0",
  });
  await sendText(chatId, `Предложение обмена #${trade.id} отправлено игроку ID ${targetId}. Сначала он выберет свой предмет, затем вы укажете доплату.`, user.telegramId);
  await telegram.sendMessage(
    Number(target.telegramId),
    `Игрок ID ${user.userId} предлагает обмен.\nЕго предмет: ${item(owned.catalogId)?.name ?? "Неизвестно"}\nПредложение #${trade.id}`,
    inline([
      [{ text: "Принять и выбрать свой предмет", callback_data: `trade:accept:${trade.id}` }],
      [{ text: "Отклонить", callback_data: `trade:reject:${trade.id}` }],
    ]),
  );
}

async function chooseTradeAsset(chatId: number, user: User, trade: TradeOffer) {
  const assets = assetsForTrade(user, trade.kind);
  if (!assets.length) {
    await sendText(chatId, "У вас нет подходящего предмета для обмена.", user.telegramId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    `Обмен #${trade.id}. Выберите предмет, который отдаёте:`,
    inline([
      ...assets.map((owned) => [{ text: item(owned.catalogId)?.name ?? "Неизвестно", callback_data: `trade:set:${trade.id}:${owned.instanceId}` }]),
      [{ text: "Отмена", callback_data: `trade:reject:${trade.id}` }],
    ]),
  );
}

function ownsAsset(user: User, asset?: OwnedItem) {
  return Boolean(asset && store.getOwned(user, asset.instanceId)?.catalogId === asset.catalogId);
}

async function completeTrade(chatId: number, user: User, trade: TradeOffer) {
  const initiator = store.findUserById(trade.initiatorId);
  const target = store.findUserById(trade.targetId);
  const payment = BigInt(trade.extraPayment ?? "0");
  if (!initiator || !target || !trade.initiatorAsset || !trade.targetAsset || !ownsAsset(initiator, trade.initiatorAsset) || !ownsAsset(target, trade.targetAsset)) {
    trade.status = "cancelled";
    await store.updateTrade(trade);
    await sendText(chatId, "Обмен отменён: один из предметов больше не принадлежит владельцу.", user.telegramId);
    return;
  }
  if (BigInt(initiator.coins) < payment) {
    trade.initiatorReady = false;
    await store.updateTrade(trade);
    await sendText(chatId, `У инициатора не хватает монет для доплаты ${money(payment)}. Обмен не завершён.`, user.telegramId);
    return;
  }
  await store.removeOwned(initiator, trade.initiatorAsset);
  await store.removeOwned(target, trade.targetAsset);
  await store.addOwned(initiator, trade.targetAsset.catalogId);
  await store.addOwned(target, trade.initiatorAsset.catalogId);
  if (payment > 0n) {
    initiator.coins = (BigInt(initiator.coins) - payment).toString();
    target.coins = (BigInt(target.coins) + payment).toString();
    await store.updateUser(initiator);
    await store.updateUser(target);
  }
  trade.status = "completed";
  await store.updateTrade(trade);
  const paymentText = payment > 0n ? ` Доплата: ${money(payment)}.` : " Без доплаты.";
  await sendText(chatId, `Обмен #${trade.id} завершён успешно.${paymentText}`, user.telegramId);
  if (Number(target.telegramId) !== chatId) await sendText(Number(target.telegramId), `Обмен #${trade.id} завершён успешно.${paymentText}`, target.telegramId);
}

async function showAdmin(chatId: number) {
  await telegram.sendMessage(
    chatId,
    "Админ-панель\n\nОсторожно: выдача предметов и валюты применяется сразу.",
    inline([
      [{ text: "Выдать деньги", callback_data: "admin:money" }, { text: "Выдать донат", callback_data: "admin:donate" }],
      [{ text: "Выдать предмет", callback_data: "admin:item" }],
      [{ text: "Ответить на техподдержку", callback_data: "admin:support" }],
      [{ text: "📢 Рассылка всем", callback_data: "admin:broadcast" }],
      [{ text: "Создать промокод", callback_data: "admin:promo" }],
      [{ text: "ID предметов", callback_data: "admin:ids" }],
      [{ text: "Назад", callback_data: "back:profile" }],
    ]),
  );
}

async function adminIds(chatId: number) {
  const lines = catalog.map((product) => `${product.id} · ${product.name}${product.hidden ? " · только выдача" : ""}`);
  await sendLong(chatId, `Каталог ID предметов\n\n${lines.join("\n")}`);
}

async function broadcastToServer(text: string) {
  const recipients = store.users.filter((recipient) => /^\d+$/.test(recipient.telegramId));
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await telegram.sendMessage(Number(recipient.telegramId), `📢 Сообщение администрации\n\n${text}`);
      sent += 1;
    } catch (error: unknown) {
      failed += 1;
      logTelegramError(error, `broadcast to ${recipient.telegramId}`);
    }
    await sleep(80);
  }
  return { sent, failed, total: recipients.length };
}

async function processText(chatId: number, user: User, text: string) {
  const session = sessions.get(user.telegramId);
  if (!session) {
    await sendText(chatId, "Выберите действие кнопками внизу.", user.telegramId);
    return;
  }

  if (session.type === "promo") {
    sessions.delete(user.telegramId);
    const result = await store.redeemPromo(user, text.trim());
    await sendText(chatId, result.ok ? "Промокод активирован." : result.reason, user.telegramId);
    return;
  }
  if (session.type === "support") {
    sessions.delete(user.telegramId);
    const ticket = await store.addTicket(user.userId, text.trim());
    await sendText(chatId, "Ваше сообщение было отправлено на просмотр модератору. Ожидайте ответа.", user.telegramId);
    if (ADMIN_ID()) {
      await telegram.sendMessage(Number(ADMIN_ID()), `Новое обращение #${ticket.id}\nОт: ${userName(user)} · ID ${user.userId}\n\n${ticket.text}`, inline([
        [{ text: "Ответить", callback_data: `admin:ticket:${ticket.id}` }],
      ]));
    }
    return;
  }
  if (session.type === "casino") {
    sessions.delete(user.telegramId);
    await playCasino(chatId, user, text);
    return;
  }
  if (session.type === "clanName") {
    sessions.delete(user.telegramId);
    await createClan(chatId, user, text);
    return;
  }
  if (session.type === "clanJoin") {
    sessions.delete(user.telegramId);
    await joinClan(chatId, user, text);
    return;
  }
  if (session.type === "clanInviteUser") {
    sessions.delete(user.telegramId);
    await inviteToClan(chatId, user, text);
    return;
  }
  if (session.type === "clanRankUser") {
    sessions.delete(user.telegramId);
    await promoteClanMember(chatId, user, text);
    return;
  }
  if (session.type === "clanRankValue") {
    await setClanMemberRank(chatId, user, session.targetId, text);
    return;
  }
  if (session.type === "clanRankNumber") {
    const rank = Number(text.trim());
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      await sendText(chatId, "Введите номер ранга от 1 до 10.", user.telegramId);
      return;
    }
    sessions.set(user.telegramId, { type: "clanRankName", rank });
    await sendText(chatId, `Введите новое название для ранга ${rank}.`, user.telegramId);
    return;
  }
  if (session.type === "clanRankName") {
    await saveClanRankName(chatId, user, session.rank, text);
    return;
  }
  if (session.type === "clanKickUser") {
    sessions.delete(user.telegramId);
    await kickFromClan(chatId, user, text);
    return;
  }
  if (session.type === "clanChat") {
    await writeClanMessage(chatId, user, text);
    return;
  }
  if (session.type === "marketTarget") {
    sessions.delete(user.telegramId);
    await showMarketAssets(chatId, user, session.assetType);
    return;
  }
  if (session.type === "marketPrice") {
    sessions.delete(user.telegramId);
    await listAsset(chatId, user, session.assetType, session.instanceId, text);
    return;
  }
  if (session.type === "tradeTarget") {
    sessions.delete(user.telegramId);
    await createTrade(chatId, user, session.kind, text);
    return;
  }
  if (session.type === "profileTarget") {
    const targetId = Number(text.trim());
    sessions.delete(user.telegramId);
    await showOtherProfile(chatId, user, targetId);
    return;
  }
  if (session.type === "tradePayment") {
    const payment = amountFromText(text);
    const trade = store.trades.find((entry) => entry.id === session.tradeId && entry.initiatorId === user.userId && entry.status === "pending");
    if (payment === undefined || !trade) {
      await sendText(chatId, "Введите целое число 0 или больше. Например: 0", user.telegramId);
      return;
    }
    if (BigInt(user.coins) < payment) {
      await sendText(chatId, `У вас недостаточно монет для доплаты ${money(payment)}. Введите меньшую сумму.`, user.telegramId);
      return;
    }
    trade.extraPayment = payment.toString();
    await store.updateTrade(trade);
    sessions.delete(user.telegramId);
    const target = store.findUserById(trade.targetId);
    await sendText(chatId, `Доплата по обмену #${trade.id}: ${money(payment)}. Нажмите «Готов», когда всё проверили.`, user.telegramId);
    await telegram.sendMessage(chatId, "Подтвердите обмен:", inline([[{ text: "Готов", callback_data: `trade:ready:${trade.id}` }]]));
    if (target) {
      await sendText(Number(target.telegramId), `Инициатор добавляет доплату: ${money(payment)}. Нажмите «Готов», если согласны.`, target.telegramId);
      await telegram.sendMessage(Number(target.telegramId), "Подтвердите обмен:", inline([[{ text: "Готов", callback_data: `trade:ready:${trade.id}` }]]));
    }
    return;
  }
  if (session.type === "adminMoneyUser") {
    const targetId = Number(text.trim());
    if (!store.findUserById(targetId)) {
      await sendText(chatId, "Игрок с таким ID не найден. Введите ID ещё раз.", user.telegramId);
      return;
    }
    sessions.set(user.telegramId, { type: "adminMoneyAmount", targetId });
    await sendText(chatId, "Введите сумму монет целым числом.", user.telegramId);
    return;
  }
  if (session.type === "adminMoneyAmount") {
    const amount = amountFromText(text);
    const target = store.findUserById(session.targetId);
    if (!amount || !target) {
      await sendText(chatId, "Введите корректную сумму.", user.telegramId);
      return;
    }
    target.coins = (BigInt(target.coins) + amount).toString();
    await store.updateUser(target);
    sessions.delete(user.telegramId);
    await sendText(chatId, `Выдано ${money(amount)} игроку ID ${target.userId}.`, user.telegramId);
    await sendText(Number(target.telegramId), `Администратор выдал вам ${money(amount)}.`, target.telegramId);
    return;
  }
  if (session.type === "adminDonateUser") {
    const targetId = Number(text.trim());
    if (!store.findUserById(targetId)) {
      await sendText(chatId, "Игрок с таким ID не найден. Введите ID ещё раз.", user.telegramId);
      return;
    }
    sessions.set(user.telegramId, { type: "adminDonateAmount", targetId });
    await sendText(chatId, "Введите количество доната целым числом.", user.telegramId);
    return;
  }
  if (session.type === "adminDonateAmount") {
    const amount = amountFromText(text);
    const target = store.findUserById(session.targetId);
    if (!amount || !target) {
      await sendText(chatId, "Введите корректное количество доната.", user.telegramId);
      return;
    }
    target.donate = (BigInt(target.donate) + amount).toString();
    await store.updateUser(target);
    sessions.delete(user.telegramId);
    await sendText(chatId, `Выдано ${donate(amount)} игроку ID ${target.userId}.`, user.telegramId);
    await sendText(Number(target.telegramId), `Администратор выдал вам ${donate(amount)}.`, target.telegramId);
    return;
  }
  if (session.type === "adminItemUser") {
    const targetId = Number(text.trim());
    if (!store.findUserById(targetId)) {
      await sendText(chatId, "Игрок с таким ID не найден. Введите ID ещё раз.", user.telegramId);
      return;
    }
    sessions.set(user.telegramId, { type: "adminItemId", targetId });
    await sendText(chatId, "Введите ID предмета из списка.", user.telegramId);
    return;
  }
  if (session.type === "adminItemId") {
    const catalogId = Number(text.trim());
    const target = store.findUserById(session.targetId);
    if (!target || !catalogById.has(catalogId)) {
      await sendText(chatId, "Предмет с таким ID не найден.", user.telegramId);
      return;
    }
    const owned = await store.addOwned(target, catalogId);
    sessions.delete(user.telegramId);
    await sendText(chatId, `Предмет выдан игроку ID ${target.userId}. Экземпляр: ${owned.instanceId}.`, user.telegramId);
    await sendText(Number(target.telegramId), `Администратор выдал вам предмет: ${item(catalogId)?.name}.`, target.telegramId);
    return;
  }
  if (session.type === "adminBroadcast") {
    if (!isAdmin(user.telegramId)) {
      sessions.delete(user.telegramId);
      return;
    }
    const message = text.trim();
    if (!message || message.length > 3800) {
      await sendText(chatId, "Введите текст длиной от 1 до 3800 символов.", user.telegramId);
      return;
    }
    sessions.delete(user.telegramId);
    const result = await broadcastToServer(message);
    await sendText(chatId, `Рассылка завершена. Доставлено: ${result.sent} из ${result.total}. Ошибок доставки: ${result.failed}.`, user.telegramId);
    return;
  }
  if (session.type === "adminReply") {
    sessions.delete(user.telegramId);
    const ticket = await store.answerTicket(session.ticketId, text.trim());
    if (!ticket) {
      await sendText(chatId, "Обращение не найдено.", user.telegramId);
      return;
    }
    const target = store.findUserById(ticket.userId);
    await sendText(chatId, `Ответ по обращению #${ticket.id} отправлен.`, user.telegramId);
    if (target) await sendText(Number(target.telegramId), `Ответ от модератора:\n\n${ticket.answer}`, target.telegramId);
    return;
  }
  if (session.type === "promoCode") {
    sessions.set(user.telegramId, { type: "promoMax", promoType: session.promoType, code: text.trim() });
    await sendText(chatId, "Введите количество активаций. 0 — промокод навсегда.", user.telegramId);
    return;
  }
  if (session.type === "promoMax") {
    const max = Number(text.trim());
    if (!Number.isInteger(max) || max < 0) {
      await sendText(chatId, "Введите целое число 0 или больше.", user.telegramId);
      return;
    }
    sessions.set(user.telegramId, { type: "promoValue", promoType: session.promoType, code: session.code, max });
    await sendText(chatId, session.promoType === "item" ? "Введите ID предмета." : "Введите сумму награды.", user.telegramId);
    return;
  }
  if (session.type === "promoValue") {
    const value = amountFromText(text);
    if (!value || (session.promoType === "item" && !catalogById.has(Number(value)))) {
      await sendText(chatId, "Введите корректное значение.", user.telegramId);
      return;
    }
    await store.addPromo({
      code: session.code,
      type: session.promoType,
      value: value.toString(),
      activations: 0,
      maxActivations: session.max,
      redeemedBy: [],
    });
    sessions.delete(user.telegramId);
    await sendText(chatId, `Промокод ${session.code} создан.`, user.telegramId);
  }
}

async function handleMessage(message: TelegramMessage) {
  const user = await getUser(message);
  if (!user || !message.text) return;
  const chatId = message.chat.id;
  const text = message.text.trim();
  if (text === "/start") {
    sessions.delete(user.telegramId);
    await sendProfile(chatId, user);
    return;
  }
  if (text === "👤 Профиль" || text === "Профиль") {
    await sendProfile(chatId, user);
    return;
  }
  if (text === "🛍 Общий магазин" || text === "Общий магазин") {
    await showStore(chatId, user.telegramId);
    return;
  }
  if (text === "💳 Донат" || text === "Донат") {
    await showDonate(chatId, user);
    return;
  }
  if (text === "🆘 Техподдержка" || text === "Техподдержка") {
    sessions.set(user.telegramId, { type: "support" });
    await sendText(chatId, "Введите ваш вопрос, жалобу или описание бага. Вам ответят в течение 24 часов.", user.telegramId);
    return;
  }
  if (text === "🎰 Казино" || text === "Казино") {
    await showCasino(chatId, user);
    return;
  }
  if (text === "🏆 Форбс" || text === "Форбс") {
    await showForbes(chatId);
    return;
  }
  if (text === "👥 Кланы" || text === "Кланы") {
    await showClans(chatId, user);
    return;
  }
  if (text === "🏷 Торговая площадка" || text === "Торговая площадка") {
    await showMarket(chatId, user);
    return;
  }
  if (text === "🔄 Обмен" || text === "Обмен") {
    await showExchange(chatId, user);
    return;
  }
  if (text === "💼 Работы" || text === "Работы") {
    await showJobs(chatId, user);
    return;
  }
  if (text === "🛠 Админ-панель" && isAdmin(user.telegramId)) {
    await showAdmin(chatId);
    return;
  }
  await processText(chatId, user, text);
}

async function handleCallback(callback: TelegramCallbackQuery) {
  const user = await getCallbackUser(callback);
  if (!user || !callback.data || !callback.message) return;
  const chatId = callback.message.chat.id;
  const data = callback.data;
  await telegram.answerCallback(callback.id);

  if (data === "noop") return;
  if (data === "back:profile") {
    await sendProfile(chatId, user);
    return;
  }
  if (data === "shop:menu") {
    await showStore(chatId, user.telegramId);
    return;
  }
  if (data.startsWith("shop:")) {
    const kind = data.split(":")[1];
    if (kind === "clothing") await showClothing(chatId);
    else if (kind && kind in categoryLabels) await showCatalog(chatId, kind as CatalogKind);
    return;
  }
  if (data.startsWith("catalog:")) {
    const [, kind, page] = data.split(":");
    if (kind && kind in categoryLabels) await showCatalog(chatId, kind as CatalogKind, Number(page));
    return;
  }
  if (data.startsWith("product:")) {
    const product = item(Number(data.split(":")[1]));
    if (product) await showProduct(chatId, product);
    return;
  }
  if (data.startsWith("buy:")) {
    const product = item(Number(data.split(":")[1]));
    if (product) await buyProduct(chatId, user, product);
    return;
  }
  if (data.startsWith("buydonate:")) {
    const product = item(Number(data.split(":")[1]));
    if (product) await buyDonateProduct(chatId, user, product);
    return;
  }
  if (data === "inventory") {
    await showInventory(chatId, user);
    return;
  }
  if (data.startsWith("invitem:")) {
    await showInventoryItem(chatId, user, data.slice("invitem:".length));
    return;
  }
  if (data.startsWith("equip:") || data.startsWith("unequip:")) {
    const instanceId = data.split(":")[1];
    const owned = user.inventory.find((entry) => entry.instanceId === instanceId);
    if (owned) {
      owned.equipped = data.startsWith("equip:");
      await store.updateUser(user);
      // Refresh the profile once. Do not append the old item card or a
      // separate product photo: the rendered avatar is the single source of
      // truth for how an equipped item looks.
      await sendProfile(chatId, user);
    }
    return;
  }
  if (data === "profile:other") {
    sessions.set(user.telegramId, { type: "profileTarget" });
    await sendText(chatId, "Введите внутренний ID игрока из бота, чей профиль хотите посмотреть.", user.telegramId);
    return;
  }
  if (data.startsWith("public:profile:")) {
    await showOtherProfile(chatId, user, Number(data.split(":")[2]));
    return;
  }
  if (data.startsWith("public:inventory:")) {
    await showPublicInventory(chatId, user, Number(data.split(":")[2]));
    return;
  }
  if (data.startsWith("public:property:")) {
    await showPublicProperty(chatId, user, Number(data.split(":")[2]));
    return;
  }
  if (data === "promo") {
    sessions.set(user.telegramId, { type: "promo" });
    await sendText(chatId, "Введите промокод.", user.telegramId);
    return;
  }
  if (data === "property") {
    await showProperty(chatId, user);
    return;
  }
  if (data === "property:cars" || data === "property:houses") {
    await showPropertyList(chatId, user, data.endsWith("cars") ? "cars" : "houses");
    return;
  }
  if (data.startsWith("property:item:")) {
    await showPropertyItem(chatId, user, data.slice("property:item:".length));
    return;
  }
  if (data.startsWith("sellproperty:")) {
    const instanceId = data.slice("sellproperty:".length);
    const owned = store.getOwned(user, instanceId);
    const product = owned ? item(owned.catalogId) : undefined;
    if (owned && product && (product.kind === "cars" || product.kind === "houses")) {
      await store.removeOwned(user, owned);
      const payout = (BigInt(product.price) * 70n) / 100n;
      user.coins = (BigInt(user.coins) + payout).toString();
      await store.updateUser(user);
      await sendText(chatId, `Имущество продано государству за ${money(payout)}.`, user.telegramId);
    }
    return;
  }
  if (data === "donate:shop") {
    await showDonate(chatId, user);
    return;
  }
  if (data === "casino:stake") {
    sessions.set(user.telegramId, { type: "casino" });
    await sendText(chatId, "Введите сумму ставки целым числом.", user.telegramId);
    return;
  }
  if (data === "forbes") {
    await showForbes(chatId);
    return;
  }
  if (data === "clans") {
    await showClans(chatId, user);
    return;
  }
  if (data.startsWith("clan:invite:accept:")) {
    await resolveClanInvite(chatId, user, Number(data.split(":")[3]), true);
    return;
  }
  if (data.startsWith("clan:invite:decline:")) {
    await resolveClanInvite(chatId, user, Number(data.split(":")[3]), false);
    return;
  }
  if (data === "clan:chat") {
    sessions.set(user.telegramId, { type: "clanChat" });
    await showClanChat(chatId, user);
    return;
  }
  if (data === "clan:chat:refresh") {
    sessions.set(user.telegramId, { type: "clanChat" });
    await showClanChat(chatId, user);
    return;
  }
  if (data === "clan:chat:leave") {
    sessions.delete(user.telegramId);
    await showClans(chatId, user);
    return;
  }
  if (data === "clan:members") {
    await showClanMembers(chatId, user);
    return;
  }
  if (data === "clan:invites") {
    await showClanInvites(chatId, user);
    return;
  }
  if (data === "clan:invite") {
    sessions.set(user.telegramId, { type: "clanInviteUser" });
    await sendText(chatId, "Введите ID игрока, которому отправить приглашение в клан.", user.telegramId);
    return;
  }
  if (data === "clan:promote") {
    sessions.set(user.telegramId, { type: "clanRankUser" });
    await sendText(chatId, "Введите ID участника клана, которому изменить ранг.", user.telegramId);
    return;
  }
  if (data === "clan:rename") {
    sessions.set(user.telegramId, { type: "clanRankNumber" });
    await sendText(chatId, "Введите номер ранга от 1 до 10.", user.telegramId);
    return;
  }
  if (data === "clan:kick") {
    sessions.set(user.telegramId, { type: "clanKickUser" });
    await sendText(chatId, "Введите ID игрока, которого нужно выгнать из клана.", user.telegramId);
    return;
  }
  if (data === "clan:leave") {
    await leaveClan(chatId, user);
    return;
  }
  if (data === "clan:create") {
    sessions.set(user.telegramId, { type: "clanName" });
    await sendText(chatId, "Введите название клана от 3 до 32 символов.", user.telegramId);
    return;
  }
  if (data === "clan:join") {
    sessions.set(user.telegramId, { type: "clanJoin" });
    await sendText(chatId, "Введите ID клана, например CLAN-0001.", user.telegramId);
    return;
  }
  if (data.startsWith("job:")) {
    await doJob(chatId, user, data.slice("job:".length));
    return;
  }
  if (data === "jobs") {
    await showJobs(chatId, user);
    return;
  }
  if (data === "market") {
    await showMarket(chatId, user);
    return;
  }
  if (data.startsWith("market:sell:")) {
    const assetType = data.split(":")[2] as "item" | "car" | "house";
    await showMarketAssets(chatId, user, assetType);
    return;
  }
  if (data.startsWith("market:select:")) {
    const [, , assetType, instanceId] = data.split(":") as [string, string, "item" | "car" | "house", string];
    sessions.set(user.telegramId, { type: "marketPrice", assetType, instanceId });
    await sendText(chatId, "Введите цену, за которую выставить имущество.", user.telegramId);
    return;
  }
  if (data.startsWith("market:buy:")) {
    await buyListing(chatId, user, Number(data.split(":")[2]));
    return;
  }
  if (data.startsWith("market:cancel:")) {
    await cancelListing(chatId, user, Number(data.split(":")[2]));
    return;
  }
  if (data === "exchange") {
    await showExchange(chatId, user);
    return;
  }
  if (data === "exchange:any" || data === "exchange:items" || data === "exchange:property") {
    sessions.set(user.telegramId, { type: "tradeTarget", kind: "any" });
    await sendText(chatId, "Введите ID игрока, с которым хотите обменяться.", user.telegramId);
    return;
  }
  if (data.startsWith("trade:offer:")) {
    const [, , kind, targetId, instanceId] = data.split(":") as [string, string, "items" | "property", string, string];
    await offerTrade(chatId, user, kind, Number(targetId), instanceId);
    return;
  }
  if (data.startsWith("trade:accept:")) {
    const trade = store.trades.find((entry) => entry.id === Number(data.split(":")[2]) && entry.targetId === user.userId && entry.status === "pending");
    if (trade) await chooseTradeAsset(chatId, user, trade);
    return;
  }
  if (data.startsWith("trade:reject:")) {
    const trade = store.trades.find((entry) => entry.id === Number(data.split(":")[2]) && [entry.targetId, entry.initiatorId].includes(user.userId));
    if (trade) {
      trade.status = "cancelled";
      await store.updateTrade(trade);
      await sendText(chatId, "Обмен отменён.", user.telegramId);
    }
    return;
  }
  if (data.startsWith("trade:set:")) {
    const [, , tradeId, instanceId] = data.split(":");
    const trade = store.trades.find((entry) => entry.id === Number(tradeId) && entry.targetId === user.userId && entry.status === "pending");
    if (trade && assetsForTrade(user, trade.kind).some((asset) => asset.instanceId === instanceId)) {
      trade.targetAsset = assetsForTrade(user, trade.kind).find((asset) => asset.instanceId === instanceId);
      await store.updateTrade(trade);
      const initiator = store.findUserById(trade.initiatorId);
      await sendText(chatId, `Предмет выбран для обмена #${trade.id}. Инициатору предложено указать доплату.`, user.telegramId);
      if (initiator) {
        sessions.set(initiator.telegramId, { type: "tradePayment", tradeId: trade.id });
        await sendText(Number(initiator.telegramId), `Введите, сколько хотите доплатить по обмену #${trade.id}. Если доплаты нет, напишите 0.`, initiator.telegramId);
      }
    }
    return;
  }
  if (data.startsWith("trade:ready:")) {
    const trade = store.trades.find((entry) => entry.id === Number(data.split(":")[2]) && [entry.targetId, entry.initiatorId].includes(user.userId) && entry.status === "pending");
    if (!trade || !trade.initiatorAsset || !trade.targetAsset) {
      await sendText(chatId, "Сначала оба игрока должны выбрать предметы для обмена.", user.telegramId);
      return;
    }
    const payment = BigInt(trade.extraPayment ?? "0");
    const initiator = store.findUserById(trade.initiatorId);
    if (!initiator || BigInt(initiator.coins) < payment) {
      await sendText(chatId, `У инициатора недостаточно монет для доплаты ${money(payment)}.`, user.telegramId);
      return;
    }
    if (user.userId === trade.initiatorId) trade.initiatorReady = true;
    if (user.userId === trade.targetId) trade.targetReady = true;
    await store.updateTrade(trade);
    if (trade.initiatorReady && trade.targetReady) await completeTrade(chatId, user, trade);
    else await sendText(chatId, `Готовность сохранена. Доплата: ${money(payment)}. Ждём второго игрока.`, user.telegramId);
    return;
  }
  if (data.startsWith("admin:")) {
    if (!isAdmin(user.telegramId)) return;
    if (data === "admin:money") {
      sessions.set(user.telegramId, { type: "adminMoneyUser" });
      await sendText(chatId, "Введите ID игрока для выдачи денег.", user.telegramId);
    } else if (data === "admin:donate") {
      sessions.set(user.telegramId, { type: "adminDonateUser" });
      await sendText(chatId, "Введите ID игрока для выдачи доната.", user.telegramId);
    } else if (data === "admin:item") {
      sessions.set(user.telegramId, { type: "adminItemUser" });
      await sendText(chatId, "Введите ID игрока для выдачи предмета.", user.telegramId);
    } else if (data === "admin:ids") {
      await adminIds(chatId);
    } else if (data === "admin:broadcast") {
      sessions.set(user.telegramId, { type: "adminBroadcast" });
      await sendText(chatId, "Введите текст рассылки для всех зарегистрированных игроков.", user.telegramId);
    } else if (data === "admin:promo") {
      await telegram.sendMessage(chatId, "Выберите тип промокода:", inline([
        [{ text: "На деньги", callback_data: "promo:create:money" }, { text: "На донат", callback_data: "promo:create:donate" }],
        [{ text: "На предмет", callback_data: "promo:create:item" }],
      ]));
    } else if (data === "admin:support") {
      const open = store.tickets.filter((ticket) => ticket.status === "open");
      await telegram.sendMessage(chatId, open.length ? "Открытые обращения:" : "Открытых обращений нет.", inline(open.map((ticket) => [{ text: `Обращение #${ticket.id} · ID ${ticket.userId}`, callback_data: `admin:ticket:${ticket.id}` }])));
    } else if (data.startsWith("admin:ticket:")) {
      const ticketId = Number(data.split(":")[2]);
      sessions.set(user.telegramId, { type: "adminReply", ticketId });
      await sendText(chatId, "Введите текст ответа пользователю.", user.telegramId);
    }
    return;
  }
  if (data.startsWith("promo:create:")) {
    if (!isAdmin(user.telegramId)) return;
    const promoType = data.split(":")[2] as "money" | "donate" | "item";
    sessions.set(user.telegramId, { type: "promoCode", promoType });
    await sendText(chatId, "Введите текст промокода.", user.telegramId);
  }
}

async function processUpdate(update: TelegramUpdate) {
  if (update.message) await handleMessage(update.message);
  if (update.callback_query) await handleCallback(update.callback_query);
}

async function passiveIncome() {
  const eligible = store.users.filter((user) =>
    user.inventory.some((owned) => owned.equipped && Boolean(item(owned.catalogId)?.passivePerSecond)),
  );
  for (const user of eligible) {
    const count = user.inventory.filter((owned) => owned.equipped && Boolean(item(owned.catalogId)?.passivePerSecond)).length;
    user.coins = (BigInt(user.coins) + BigInt(count) * 100_000n).toString();
    await store.updateUser(user);
  }
}

export async function startBot() {
  if (!process.env["TELEGRAM_BOT_TOKEN"]) {
    logger.warn("TELEGRAM_BOT_TOKEN is not configured; Telegram bot is disabled");
    return;
  }
  await store.load();
  await telegram.deleteWebhook();
  logger.info({ users: store.users.length }, "RP Telegram bot started");
  let offset = 0;
  void (async () => {
    while (true) {
      try {
        const updates = await telegram.getUpdates(offset, 25);
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            await processUpdate(update);
          } catch (error: unknown) {
            logTelegramError(error, `update ${update.update_id}`);
          }
        }
      } catch (error: unknown) {
        logTelegramError(error, "polling");
        await sleep(3000);
      }
    }
  })();
  setInterval(() => {
    passiveIncome().catch((error: unknown) => logTelegramError(error, "passive income"));
  }, 1000);
}
