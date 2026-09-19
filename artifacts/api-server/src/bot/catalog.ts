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

export type CatalogItem = {
  id: number;
  kind: CatalogKind;
  name: string;
  price: string;
  donatePrice?: string;
  hidden?: boolean;
  passivePerSecond?: string;
  imageUrl?: string;
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
const cigaretteNames = [
  "Marlboro Red",
  "Marlboro Gold",
  "Parliament Aqua Blue",
  "Kent Nano Silver",
  "Winston XStyle",
  "Camel Compact",
  "Lucky Strike Original",
  "Dunhill Fine Cut",
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
const cars = carNames.map((name, index) => ({
  id: 7001 + index,
  kind: "cars" as const,
  name,
  price: (carPrices[index] ?? 500_000n).toString(),
}));
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
      ? { ...item, id: 6767, name: "Золотая папироса", passivePerSecond: "100000" }
      : item,
  ),
  ...generated("accessories", 6801, cigaretteNames, 50_000n, 5_000_000n),
  ...cars,
  ...generated("houses", 8001, houseNames, 100_000n, 100_000_000_000n),
  {
    id: 67,
    kind: "cars",
    name: "Полицейский Бэт-мобиль с мигалками",
    price: "25000000000",
  },
  {
    id: 9001,
    kind: "donate",
    name: "Золотая цепочка",
    price: "0",
    donatePrice: "1000",
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
