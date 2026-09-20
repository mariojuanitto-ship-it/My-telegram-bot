export type CatalogKind =
  | "sneakers"
  | "shirts"
  | "pants"
  | "jackets"
  | "hats"
  | "accessories"
  | "cars"
  | "houses"
  | "donate";

export type CaseType = "accessories" | "cars";

export type CaseReward = {
  itemId: number;
  /** Relative weight supplied by the game design. The listed values do not sum to 100. */
  chance: number;
};

export type CatalogItem = {
  id: number;
  kind: CatalogKind;
  name: string;
  price: string;
  donatePrice?: string;
  donateCategory?: "items" | "cases";
  caseType?: CaseType;
  caseRewards?: CaseReward[];
  hidden?: boolean;
  marketplaceDisabled?: boolean;
  passivePerSecond?: string;
  imageUrl?: string;
  /** Explicit government buyback amount. */
  governmentSalePrice?: string;
};

const brands = [
  "Nike",
  "Adidas",
  "Jordan",
  "New Balance",
  "Puma",
  "Reebok",
  "Converse",
  "Vans",
  "ASICS",
  "Balenciaga",
  "Gucci",
  "Prada",
  "Louis Vuitton",
  "Off-White",
  "Supreme",
  "Stone Island",
  "Moncler",
  "The North Face",
  "Burberry",
  "Tommy Hilfiger",
  "Lacoste",
  "Armani",
  "Versace",
  "Fendi",
  "Dior",
  "Under Armour",
  "Carhartt",
  "Champion",
  "Ralph Lauren",
  "Ferrari",
];

const priceAt = (start: bigint, end: bigint, index: number, total: number) => {
  if (index === total - 1) return end.toString();
  const span = end - start;
  return (start + (span * BigInt(index)) / BigInt(total - 1)).toString();
};

const generated = (
  kind: CatalogKind,
  startId: number,
  names: string[],
  startPrice: bigint,
  endPrice: bigint,
): CatalogItem[] =>
  names.map((name, index) => ({
    id: startId + index,
    kind,
    name,
    price: priceAt(startPrice, endPrice, index, names.length),
  }));

const sneakerNames = brands.map((brand, index) =>
  index === 29 ? "Серебряные кроссовки RP Exclusive" : `${brand} ${["Air Max", "Forum", "Classic", "Runner"][index % 4]}`,
);
const shirtNames = brands.map((brand, index) =>
  index === 29 ? "Серебряная майка RP Exclusive" : `${brand} ${["Logo Tee", "Oversize", "Polo", "Street Tee"][index % 4]}`,
);
const pantsNames = brands.map((brand, index) =>
  index === 29 ? "Серебряные штаны RP Exclusive" : `${brand} ${["Cargo", "Denim", "Jogger", "Classic"][index % 4]}`,
);
const jacketNames = brands.map((brand, index) =>
  index === 29 ? "Серебряная куртка RP Exclusive" : `${brand} ${["Bomber", "Parka", "Puffer", "Windbreaker"][index % 4]}`,
);
const hatNames = brands.map((brand, index) => {
  if (index === 28) return "Фуражка генерала МВД полиции";
  if (index === 29) return "Фуражка генерала СВ";
  return `${brand} ${["кепка", "панама", "шляпа", "козырёк"][index % 4]}`;
});
const accessoryNames = brands.map((brand, index) =>
  index === 29 ? "Папироса RP Gold" : `${brand} ${["цепочка", "рюкзак", "очки", "браслет"][index % 4]}`,
);
const cigarNames = [
  "Сигара Classic Red",
  "Сигара Gold Reserve",
  "Сигара Aqua Blue",
  "Сигара Silver Edition",
  "Сигара XStyle",
  "Сигара Compact",
  "Сигара Original",
  "Сигара Fine Cut",
];

const carNames = [
  "ВАЗ 2107",
  "Lada Samara",
  "ЗАЗ 968",
  "ГАЗ 24 Волга",
  "Москвич 412",
  "Toyota Corolla",
  "Honda Civic",
  "Volkswagen Golf",
  "BMW E36",
  "Mercedes-Benz W124",
  "Audi A6",
  "Lexus ES",
  "Toyota Land Cruiser",
  "BMW M5",
  "Mercedes-Benz GLE",
  "Porsche 911",
  "Range Rover",
  "Lamborghini Huracan",
  "Ferrari 488",
  "McLaren 720S",
  "Rolls-Royce Phantom",
  "Bentley Continental",
  "Tesla Roadster",
  "Aston Martin DB11",
  "Pagani Huayra",
  "Koenigsegg Jesko",
  "Bugatti Chiron",
  "Bugatti La Voiture Noire",
  "Золотой спорткар RP",
  "Танк RP Armored",
];
const carPrices = [
  500_000n,
  350_000n,
  180_000n,
  450_000n,
  250_000n,
  1_800_000n,
  2_200_000n,
  1_500_000n,
  1_200_000n,
  1_800_000n,
  3_000_000n,
  4_000_000n,
  8_000_000n,
  12_000_000n,
  15_000_000n,
  18_000_000n,
  20_000_000n,
  35_000_000n,
  45_000_000n,
  50_000_000n,
  70_000_000n,
  60_000_000n,
  9_000_000n,
  40_000_000n,
  150_000_000n,
  200_000_000n,
  180_000_000n,
  250_000_000n,
  500_000_000n,
  1_000_000_000n,
];
const cars = [
  ...carNames.map((name, index) => ({
    id: 7001 + index,
    kind: "cars" as const,
    name,
    price: (carPrices[index] ?? 500_000n).toString(),
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  })),
  {
    id: 7041,
    kind: "cars" as const,
    name: "Ford Mustang Shelby GT500",
    price: "80000000",
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  },
  {
    id: 7042,
    kind: "cars" as const,
    name: "Bugatti Divo",
    price: "400000000",
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  },
];

const caseAccessories: CatalogItem[] = [
  { id: 6101, kind: "accessories", name: "Кольцо RP Gold", price: "9000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6102, kind: "accessories", name: "Платиновый браслет", price: "12000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6103, kind: "accessories", name: "Платиновая цепочка", price: "18000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6104, kind: "accessories", name: "Золотые очки", price: "25000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6105, kind: "accessories", name: "Платиновые очки", price: "45000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6106, kind: "accessories", name: "Серебряная сигара", price: "10000000", passivePerSecond: "10000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6107, kind: "accessories", name: "Золотая сигара", price: "100000000", passivePerSecond: "100000000", marketplaceDisabled: true, governmentSalePrice: "0" },
  { id: 6108, kind: "accessories", name: "Платиновая сигара", price: "1000000000", passivePerSecond: "1000000000", marketplaceDisabled: true, governmentSalePrice: "0" },
];

const caseCars: CatalogItem[] = [
  { id: 7778, kind: "cars", name: "Детский автомобиль", price: "300000", hidden: true, marketplaceDisabled: true, governmentSalePrice: "0" },
];
const houseNames = [
  "Место под мостом",
  "Комната в общежитии",
  "Барак на окраине",
  "Старый гараж",
  "Однокомнатная квартира",
  "Двухкомнатная квартира",
  "Дом у трассы",
  "Квартира в центре",
  "Таунхаус",
  "Дом с гаражом",
  "Коттедж у озера",
  "Пентхаус",
  "Вилла в горах",
  "Загородная резиденция",
  "Современный особняк",
  "Замок RP",
  "Башня с видом на город",
  "Островная вилла",
  "Дворец миллионера",
  "Умный дом",
  "Лофт-бункер",
  "Резиденция бизнесмена",
  "Дом на побережье",
  "Элитный клубный дом",
  "Суперособняк",
  "Имение RP Gold",
  "Дворец наследника",
  "Замок с парком",
  "Небесная резиденция",
  "Императорский дворец",
];

export const catalog: CatalogItem[] = [
  ...generated("sneakers", 1001, sneakerNames, 100_000n, 100_000_000n),
  ...generated("shirts", 2001, shirtNames, 1_000_000n, 100_000_000n),
  ...generated("pants", 3001, pantsNames, 1_000_000n, 100_000_000n),
  ...generated("jackets", 4001, jacketNames, 1_000_000n, 100_000_000n),
  ...generated("hats", 5001, hatNames, 1_000_000n, 1_000_000_000n),
  ...generated("accessories", 6001, accessoryNames, 100_000n, 1_000_000_000n).map((item, index) =>
    index === 29
      ? {
          ...item,
          id: 6767,
          name: "Золотая сигара",
          passivePerSecond: "100000000",
          marketplaceDisabled: true,
          governmentSalePrice: "0",
        }
      : { ...item, marketplaceDisabled: true, governmentSalePrice: "0" },
  ),
  ...generated("accessories", 6801, cigarNames, 50_000n, 5_000_000n).map((item) => ({
    ...item,
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  })),
  ...caseAccessories,
  ...cars,
  ...caseCars,
  ...generated("houses", 8001, houseNames, 100_000n, 100_000_000_000n),
  {
    id: 67,
    kind: "cars",
    name: "Полицейский Бэт-мобиль с мигалками",
    price: "25000000000",
    hidden: true,
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  },
  {
    id: 7777,
    kind: "cars",
    name: "Игрушечный кукурузник",
    price: "777000000",
    marketplaceDisabled: true,
    hidden: true,
    governmentSalePrice: "0",
  },
  {
    id: 9001,
    kind: "donate",
    name: "Золотая цепочка",
    price: "0",
    donatePrice: "1000",
    donateCategory: "items",
    marketplaceDisabled: true,
    governmentSalePrice: "0",
  },
  {
    id: 9002,
    kind: "donate",
    name: "Кейс аксессуаров",
    price: "0",
    donatePrice: "2000",
    donateCategory: "cases",
    caseType: "accessories",
    marketplaceDisabled: true,
    caseRewards: [
      { itemId: 6101, chance: 90 },
      { itemId: 6102, chance: 77 },
      { itemId: 6103, chance: 66 },
      { itemId: 6104, chance: 50 },
      { itemId: 6105, chance: 30 },
      { itemId: 6106, chance: 10 },
      { itemId: 6107, chance: 0.5 },
      { itemId: 6108, chance: 0.1 },
    ],
  },
  {
    id: 9003,
    kind: "donate",
    name: "Автомобильный кейс",
    price: "0",
    donatePrice: "2000",
    donateCategory: "cases",
    caseType: "cars",
    marketplaceDisabled: true,
    caseRewards: [
      { itemId: 7041, chance: 80 },
      { itemId: 7042, chance: 50 },
      { itemId: 7027, chance: 67 },
      { itemId: 7778, chance: 30 },
      { itemId: 7777, chance: 0.5 },
      { itemId: 67, chance: 0.1 },
    ],
  },
];

export const catalogById = new Map(catalog.map((item) => [item.id, item]));

export const categoryLabels: Record<CatalogKind, string> = {
  sneakers: "Кроссовки",
  shirts: "Майки",
  pants: "Штаны",
  jackets: "Куртки",
  hats: "Головные уборы",
  accessories: "Аксессуары",
  cars: "Автомобили",
  houses: "Дома",
  donate: "Донат-аксессуары",
};

export const clothingKinds: CatalogKind[] = [
  "sneakers",
  "shirts",
  "pants",
  "jackets",
  "hats",
  "accessories",
];
