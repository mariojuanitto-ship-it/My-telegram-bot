import { deflateSync } from "node:zlib";
import { catalogById, type CatalogItem } from "./catalog";
import type { User } from "./store";

type Color = [number, number, number, number];

const WIDTH = 640;
const HEIGHT = 640;

const hex = (value: string): Color => {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
};

const palette = ["#38bdf8", "#a78bfa", "#fb7185", "#f59e0b", "#34d399", "#f97316"];

const font: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
};

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makePng(pixels: Buffer) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    rows[y * (WIDTH * 4 + 1)] = 0;
    pixels.copy(rows, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawCharacter(user: User) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const setPixel = (x: number, y: number, color: Color) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const index = (y * WIDTH + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const rect = (x: number, y: number, width: number, height: number, color: Color) => {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) setPixel(xx, yy, color);
    }
  };
  const circle = (cx: number, cy: number, radius: number, color: Color) => {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (x * x + y * y <= radius * radius) setPixel(cx + x, cy + y, color);
      }
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: Color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const progress = steps === 0 ? 0 : step / steps;
      const x = Math.round(x1 + (x2 - x1) * progress);
      const y = Math.round(y1 + (y2 - y1) * progress);
      rect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
    }
  };
  const drawText = (text: string, x: number, y: number, scale: number, color: Color) => {
    let cursor = x;
    for (const character of text.toUpperCase().slice(0, 10)) {
      if (character === " ") {
        cursor += 4 * scale;
        continue;
      }
      const glyph = font[character];
      if (!glyph) {
        cursor += 6 * scale;
        continue;
      }
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((filled, columnIndex) => {
          if (filled === "1") rect(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        });
      });
      cursor += 6 * scale;
    }
  };

  const background = hex("#101827");
  const panel = hex("#17243a");
  const white = hex("#f8fafc");
  const ink = hex("#0b1020");
  const skin = hex("#f4c7a1");
  const hair = hex("#1e293b");
  const silver = hex("#cbd5e1");
  const equipped = user.inventory
    .filter((entry) => entry.equipped)
    .map((entry) => catalogById.get(entry.catalogId))
    .filter(Boolean);
  const has = (kind: string) => equipped.find((entry) => entry?.kind === kind);
  const shirt = has("shirts");
  const pants = has("pants");
  const jacket = has("jackets");
  const shoes = has("sneakers");
  const hat = has("hats");
  const accessory = has("accessories");
  type ClothingStyle = {
    base: Color;
    secondary: Color;
    accent: Color;
    light: Color;
    dark: Color;
  };
  const styleFor = (entry: typeof shirt, fallback: string): ClothingStyle => {
    const name = entry?.name.toLowerCase() ?? "";
    const brand = brandFor(entry);
    if (name.includes("серебря")) {
      return { base: silver, secondary: hex("#94a3b8"), accent: white, light: hex("#f8fafc"), dark: hex("#475569") };
    }
    const styles: Record<string, ClothingStyle> = {
      NIKE: { base: hex("#111827"), secondary: hex("#374151"), accent: hex("#f97316"), light: white, dark: ink },
      ADIDAS: { base: hex("#f8fafc"), secondary: hex("#111827"), accent: hex("#dc2626"), light: white, dark: ink },
      JORDAN: { base: hex("#111827"), secondary: hex("#dc2626"), accent: white, light: hex("#f8fafc"), dark: ink },
      NB: { base: hex("#1e3a5f"), secondary: hex("#94a3b8"), accent: hex("#e11d48"), light: hex("#e2e8f0"), dark: hex("#0f172a") },
      PUMA: { base: hex("#111827"), secondary: hex("#f8fafc"), accent: hex("#dc2626"), light: white, dark: ink },
      REEBOK: { base: hex("#f8fafc"), secondary: hex("#1d4ed8"), accent: hex("#dc2626"), light: white, dark: ink },
      CONVERSE: { base: hex("#111827"), secondary: hex("#f8fafc"), accent: hex("#dc2626"), light: white, dark: ink },
      VANS: { base: hex("#111827"), secondary: hex("#f8fafc"), accent: hex("#dc2626"), light: white, dark: ink },
      ASICS: { base: hex("#2563eb"), secondary: hex("#bae6fd"), accent: hex("#f8fafc"), light: hex("#dbeafe"), dark: hex("#172554") },
      BALENCIAGA: { base: hex("#111827"), secondary: hex("#374151"), accent: hex("#f8fafc"), light: white, dark: ink },
      GUCCI: { base: hex("#166534"), secondary: hex("#dc2626"), accent: hex("#facc15"), light: hex("#fef3c7"), dark: hex("#052e16") },
      PRADA: { base: hex("#111827"), secondary: hex("#f8fafc"), accent: hex("#dc2626"), light: white, dark: ink },
      LV: { base: hex("#7c2d12"), secondary: hex("#b45309"), accent: hex("#facc15"), light: hex("#fef3c7"), dark: hex("#451a03") },
      "OFF-WHITE": { base: hex("#f5f5dc"), secondary: hex("#e5e7eb"), accent: hex("#f97316"), light: white, dark: hex("#57534e") },
      SUPREME: { base: hex("#dc2626"), secondary: hex("#991b1b"), accent: white, light: white, dark: hex("#450a0a") },
      SI: { base: hex("#475569"), secondary: hex("#64748b"), accent: hex("#facc15"), light: hex("#cbd5e1"), dark: hex("#1e293b") },
      MONCLER: { base: hex("#1e3a8a"), secondary: hex("#1d4ed8"), accent: hex("#dc2626"), light: white, dark: hex("#172554") },
      TNF: { base: hex("#111827"), secondary: hex("#374151"), accent: hex("#dc2626"), light: white, dark: ink },
      BURBERRY: { base: hex("#d6b98c"), secondary: hex("#f3e2c3"), accent: hex("#991b1b"), light: hex("#fef3c7"), dark: hex("#422006") },
      TOMMY: { base: hex("#1e3a8a"), secondary: hex("#dc2626"), accent: white, light: white, dark: hex("#172554") },
      LACOSTE: { base: hex("#f8fafc"), secondary: hex("#166534"), accent: hex("#dc2626"), light: white, dark: hex("#14532d") },
      ARMANI: { base: hex("#111827"), secondary: hex("#4b5563"), accent: hex("#f8fafc"), light: white, dark: ink },
      VERSACE: { base: hex("#111827"), secondary: hex("#facc15"), accent: hex("#facc15"), light: hex("#fef3c7"), dark: ink },
      FENDI: { base: hex("#a16207"), secondary: hex("#fef3c7"), accent: hex("#111827"), light: hex("#fef3c7"), dark: hex("#451a03") },
      DIOR: { base: hex("#64748b"), secondary: hex("#cbd5e1"), accent: hex("#111827"), light: white, dark: hex("#334155") },
      UA: { base: hex("#111827"), secondary: hex("#374151"), accent: hex("#dc2626"), light: white, dark: ink },
      CARHARTT: { base: hex("#92400e"), secondary: hex("#b45309"), accent: hex("#facc15"), light: hex("#fef3c7"), dark: hex("#451a03") },
      CHAMPION: { base: hex("#1e3a8a"), secondary: hex("#3b82f6"), accent: hex("#dc2626"), light: white, dark: hex("#172554") },
      RL: { base: hex("#1e3a8a"), secondary: hex("#f8fafc"), accent: hex("#dc2626"), light: white, dark: hex("#172554") },
    };
    const selected = styles[brand];
    if (selected) return selected;
    const color = hex(palette[(entry?.id ?? 0) % palette.length] ?? fallback);
    return { base: color, secondary: hex("#475569"), accent: hex("#f8fafc"), light: white, dark: ink };
  };
  const brandFor = (entry: typeof shirt) => {
    if (!entry) return "RP";
    const name = entry.name;
    if (name.startsWith("Nike")) return "NIKE";
    if (name.startsWith("Adidas")) return "ADIDAS";
    if (name.startsWith("Jordan")) return "JORDAN";
    if (name.startsWith("New Balance")) return "NB";
    if (name.startsWith("Puma")) return "PUMA";
    if (name.startsWith("Reebok")) return "REEBOK";
    if (name.startsWith("Converse")) return "CONVERSE";
    if (name.startsWith("Vans")) return "VANS";
    if (name.startsWith("ASICS")) return "ASICS";
    if (name.startsWith("Balenciaga")) return "BALENCIAGA";
    if (name.startsWith("Gucci")) return "GUCCI";
    if (name.startsWith("Prada")) return "PRADA";
    if (name.startsWith("Louis Vuitton")) return "LV";
    if (name.startsWith("Off-White")) return "OFF-WHITE";
    if (name.startsWith("Supreme")) return "SUPREME";
    if (name.startsWith("The North Face")) return "TNF";
    if (name.startsWith("Stone Island")) return "SI";
    if (name.startsWith("Moncler")) return "MONCLER";
    if (name.startsWith("Burberry")) return "BURBERRY";
    if (name.startsWith("Tommy Hilfiger")) return "TOMMY";
    if (name.startsWith("Lacoste")) return "LACOSTE";
    if (name.startsWith("Armani")) return "ARMANI";
    if (name.startsWith("Versace")) return "VERSACE";
    if (name.startsWith("Fendi")) return "FENDI";
    if (name.startsWith("Dior")) return "DIOR";
    if (name.startsWith("Under Armour")) return "UA";
    if (name.startsWith("Carhartt")) return "CARHARTT";
    if (name.startsWith("Champion")) return "CHAMPION";
    if (name.startsWith("Ralph Lauren")) return "RL";
    if (name.startsWith("Aston Martin")) return "AM";
    if (name.startsWith("Range Rover")) return "RR";
    return name.split(" ")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "RP";
  };
  const logo = (entry: typeof shirt, x: number, y: number, scale = 2) => {
    if (!entry) return;
    const brand = brandFor(entry);
    const style = styleFor(entry, "#38bdf8");
    const isLightFabric = style.base[0] * 299 + style.base[1] * 587 + style.base[2] * 114 > 175000;
    const logoColor = brand === "LV" || brand === "GUCCI" || brand === "VERSACE" || brand === "FENDI"
      ? style.accent
      : isLightFabric ? style.dark : style.light;
    if (brand === "NIKE") {
      line(x, y + 10 * scale, x + 8 * scale, y + 5 * scale, 2 * scale, logoColor);
      line(x + 8 * scale, y + 5 * scale, x + 19 * scale, y - 2 * scale, 2 * scale, logoColor);
    } else if (brand === "ADIDAS") {
      rect(x, y + 7 * scale, 4 * scale, 5 * scale, logoColor);
      rect(x + 6 * scale, y + 4 * scale, 4 * scale, 8 * scale, logoColor);
      rect(x + 12 * scale, y, 4 * scale, 12 * scale, logoColor);
    } else if (brand === "JORDAN") {
      circle(x + 8 * scale, y + 2 * scale, 2 * scale, logoColor);
      line(x + 8 * scale, y + 5 * scale, x + 8 * scale, y + 13 * scale, 2 * scale, logoColor);
      line(x + 8 * scale, y + 7 * scale, x + 2 * scale, y + 11 * scale, 2 * scale, logoColor);
      line(x + 8 * scale, y + 7 * scale, x + 15 * scale, y + 11 * scale, 2 * scale, logoColor);
    } else if (brand === "PUMA") {
      line(x, y + 10 * scale, x + 17 * scale, y + 2 * scale, 3 * scale, logoColor);
      circle(x + 18 * scale, y + 1 * scale, 2 * scale, logoColor);
    } else if (brand === "VANS" || brand === "CONVERSE") {
      circle(x + 8 * scale, y + 6 * scale, 7 * scale, logoColor);
      drawText(brand === "VANS" ? "V" : "★", x + 3 * scale, y + 2 * scale, Math.max(1, scale), style.dark);
    } else if (brand === "LACOSTE") {
      rect(x, y + 3 * scale, 13 * scale, 7 * scale, style.accent);
      circle(x + 14 * scale, y + 4 * scale, 3 * scale, style.accent);
    } else if (brand === "SUPREME") {
      rect(x, y, 32 * scale, 10 * scale, style.light);
      drawText("SUP", x + 3 * scale, y + 2 * scale, scale, style.base);
    } else if (brand === "GUCCI") {
      drawText("GG", x, y, scale, logoColor);
      line(x, y + 10 * scale, x + 18 * scale, y + 10 * scale, scale, style.secondary);
    } else if (brand === "BURBERRY") {
      line(x, y, x + 18 * scale, y + 12 * scale, scale, logoColor);
      line(x + 18 * scale, y, x, y + 12 * scale, scale, style.accent);
    } else if (brand === "TNF") {
      circle(x + 7 * scale, y + 6 * scale, 6 * scale, logoColor);
      drawText("TNF", x + 2 * scale, y + 2 * scale, Math.max(1, scale - 1), style.base);
    } else if (brand === "NB") {
      drawText("NB", x, y, scale, logoColor);
      line(x, y + 10 * scale, x + 20 * scale, y + 10 * scale, scale, style.accent);
    } else {
      drawText(brand.slice(0, 4), x, y, Math.max(1, scale - 1), logoColor);
    }
  };

  rect(0, 0, WIDTH, HEIGHT, background);
  rect(42, 42, WIDTH - 84, HEIGHT - 84, panel);
  rect(42, 500, WIDTH - 84, 140, hex("#0e1727"));
  circle(110, 112, 4, hex("#fbbf24"));
  circle(520, 148, 5, hex("#60a5fa"));
  circle(565, 95, 3, hex("#f472b6"));
  circle(172, 200, 3, hex("#34d399"));
  circle(320, 555, 105, hex("#090f1c"));

  const shoesStyle = styleFor(shoes, "#38bdf8");
  const pantsStyle = styleFor(pants, "#334155");
  const shirtStyle = styleFor(shirt, "#38bdf8");
  const jacketStyle = styleFor(jacket, "#475569");
  const pantsName = pants?.name.toLowerCase() ?? "";
  const shirtName = shirt?.name.toLowerCase() ?? "";
  const jacketName = jacket?.name.toLowerCase() ?? "";
  const shoesName = shoes?.name.toLowerCase() ?? "";

  // Pants: separate legs, waistband, pockets, stitching and brand-specific side details.
  rect(278, 360, 108, 24, pantsStyle.dark);
  rect(282, 370, 36, 125, pantsStyle.base);
  rect(322, 370, 36, 125, pantsStyle.base);
  line(320, 372, 320, 493, 4, pantsStyle.dark);
  line(285, 378, 315, 378, 2, pantsStyle.secondary);
  line(325, 378, 355, 378, 2, pantsStyle.secondary);
  if (pantsName.includes("cargo")) {
    rect(278, 414, 18, 28, pantsStyle.secondary);
    rect(344, 414, 18, 28, pantsStyle.secondary);
    line(279, 418, 295, 418, 2, pantsStyle.light);
    line(345, 418, 361, 418, 2, pantsStyle.light);
  } else if (pantsName.includes("denim")) {
    for (let stitch = 0; stitch < 4; stitch += 1) {
      line(285, 395 + stitch * 22, 314, 395 + stitch * 22, 1, pantsStyle.light);
      line(326, 395 + stitch * 22, 355, 395 + stitch * 22, 1, pantsStyle.light);
    }
  } else if (pantsName.includes("jogger")) {
    line(286, 391, 314, 391, 5, pantsStyle.secondary);
    line(326, 391, 354, 391, 5, pantsStyle.secondary);
    rect(280, 480, 40, 15, pantsStyle.dark);
    rect(320, 480, 40, 15, pantsStyle.dark);
  } else {
    line(288, 398, 312, 398, 2, pantsStyle.secondary);
    line(328, 398, 352, 398, 2, pantsStyle.secondary);
  }
  if (brandFor(pants) === "ADIDAS" || brandFor(pants) === "PUMA" || brandFor(pants) === "NB") {
    line(284, 385, 284, 478, 4, pantsStyle.accent);
    line(356, 385, 356, 478, 4, pantsStyle.accent);
  }
  logo(pants, 294, 423, 1);

  // Shoes: a low-top silhouette with sole, tongue and a logo on each shoe.
  rect(267, 485, 66, 25, shoesStyle.base);
  rect(331, 485, 66, 25, shoesStyle.base);
  rect(263, 506, 73, 9, shoesStyle.light);
  rect(327, 506, 73, 9, shoesStyle.light);
  line(274, 488, 320, 488, 3, shoesStyle.secondary);
  line(338, 488, 384, 488, 3, shoesStyle.secondary);
  if (shoesName.includes("air max") || shoesName.includes("runner")) {
    circle(316, 501, 6, shoesStyle.accent);
    circle(348, 501, 6, shoesStyle.accent);
  }
  logo(shoes, 282, 493, 1);
  logo(shoes, 346, 493, 1);

  // Shirt: fitted torso with neckline, sleeves and brand pattern.
  rect(270, 245, 100, 145, shirtStyle.base);
  line(279, 250, 320, 270, 15, shirtStyle.base);
  line(361, 250, 320, 270, 15, shirtStyle.base);
  line(305, 248, 320, 260, 5, shirtStyle.secondary);
  line(335, 248, 320, 260, 5, shirtStyle.secondary);
  if (shirtName.includes("polo")) {
    rect(314, 260, 12, 72, shirtStyle.secondary);
    line(320, 263, 320, 295, 2, shirtStyle.light);
  } else if (brandFor(shirt) === "BURBERRY") {
    for (let stripe = 0; stripe < 5; stripe += 1) {
      line(275 + stripe * 22, 248, 275 + stripe * 22, 386, 2, shirtStyle.accent);
      line(270, 270 + stripe * 24, 370, 270 + stripe * 24, 2, shirtStyle.secondary);
    }
  } else if (brandFor(shirt) === "GUCCI" || brandFor(shirt) === "TOMMY") {
    rect(270, 310, 100, 15, shirtStyle.secondary);
    rect(270, 325, 100, 10, shirtStyle.accent);
  } else if (brandFor(shirt) === "ADIDAS") {
    line(280, 275, 280, 375, 5, shirtStyle.secondary);
    line(289, 275, 289, 375, 5, shirtStyle.secondary);
    line(298, 275, 298, 375, 5, shirtStyle.secondary);
  } else if (brandFor(shirt) === "OFF-WHITE") {
    line(275, 265, 365, 375, 4, shirtStyle.accent);
    line(365, 265, 275, 375, 4, shirtStyle.accent);
  }
  logo(shirt, 305, 302, 2);
  if (jacket) {
    rect(260, 245, 120, 145, jacketStyle.base);
    if (jacketName.includes("bomber")) {
      rect(260, 370, 120, 20, jacketStyle.dark);
      line(270, 250, 320, 274, 12, jacketStyle.secondary);
      line(370, 250, 320, 274, 12, jacketStyle.secondary);
    } else if (jacketName.includes("puffer")) {
      for (let row = 0; row < 5; row += 1) line(264, 265 + row * 24, 376, 265 + row * 24, 5, jacketStyle.secondary);
    } else if (jacketName.includes("parka")) {
      rect(270, 255, 100, 120, jacketStyle.secondary);
      rect(278, 267, 84, 104, jacketStyle.base);
      line(320, 255, 320, 380, 5, jacketStyle.dark);
    }
    line(320, 250, 320, 380, 4, jacketStyle.light);
    logo(jacket, 285, 300, 2);
  }

  // Arms and hands.
  line(270, 270, 220, 390, 22, jacket ? jacketStyle.base : shirtStyle.base);
  line(370, 270, 420, 390, 22, jacket ? jacketStyle.base : shirtStyle.base);
  circle(217, 395, 14, skin);
  circle(423, 395, 14, skin);

  // Head, hair and simple face.
  circle(320, 182, 62, skin);
  circle(320, 132, 58, hair);
  rect(265, 144, 110, 28, hair);
  circle(298, 180, 7, ink);
  circle(342, 180, 7, ink);
  line(300, 220, 340, 220, 4, hex("#a05252"));

  if (hat) {
    const hatStyle = styleFor(hat, "#f59e0b");
    const hatName = hat.name.toLowerCase();
    rect(260, 112, 120, 20, hatStyle.base);
    if (hatName.includes("панама")) {
      rect(274, 103, 92, 28, hatStyle.base);
      rect(260, 124, 120, 9, hatStyle.secondary);
    } else {
      rect(292, 90, 58, 26, hatStyle.base);
      rect(300, 112, 80, 8, hatStyle.secondary);
    }
    logo(hat, 305, 104, 1);
  }
  if (accessory?.name.includes("цепочка")) {
    line(284, 247, 320, 280, 5, hex("#facc15"));
    line(320, 280, 356, 247, 5, hex("#facc15"));
    circle(320, 282, 10, hex("#facc15"));
  }
  if (accessory?.name.includes("очки")) {
    rect(278, 169, 38, 22, hex("#111827"));
    rect(324, 169, 38, 22, hex("#111827"));
    line(316, 178, 324, 178, 4, ink);
  }
  if (accessory?.name.includes("рюкзак")) {
    rect(245, 270, 25, 90, hex("#b45309"));
  }
  if (accessory?.name.includes("папироса")) {
    line(342, 222, 375, 214, 6, hex("#facc15"));
    rect(373, 211, 9, 7, hex("#f97316"));
    line(382, 208, 392, 190, 3, hex("#e2e8f0"));
  }

  return makePng(pixels);
}

export function renderCharacter(user: User) {
  return drawCharacter(user);
}

export function renderAssetCard(product: CatalogItem) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const setPixel = (x: number, y: number, color: Color) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const index = (y * WIDTH + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const rect = (x: number, y: number, width: number, height: number, color: Color) => {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) setPixel(xx, yy, color);
    }
  };
  const circle = (cx: number, cy: number, radius: number, color: Color) => {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (x * x + y * y <= radius * radius) setPixel(cx + x, cy + y, color);
      }
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: Color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const progress = steps === 0 ? 0 : step / steps;
      rect(
        Math.round(x1 + (x2 - x1) * progress) - Math.floor(width / 2),
        Math.round(y1 + (y2 - y1) * progress) - Math.floor(width / 2),
        width,
        width,
        color,
      );
    }
  };
  const drawText = (text: string, x: number, y: number, scale: number, color: Color) => {
    let cursor = x;
    for (const character of text.toUpperCase().slice(0, 12)) {
      const glyph = font[character];
      if (!glyph) {
        cursor += 6 * scale;
        continue;
      }
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((filled, columnIndex) => {
          if (filled === "1") rect(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        });
      });
      cursor += 6 * scale;
    }
  };

  const background = hex("#0f172a");
  const panel = hex("#1e293b");
  const white = hex("#f8fafc");
  const dark = hex("#111827");
  const accent = hex(product.name.includes("Серебря") ? "#cbd5e1" : palette[product.id % palette.length] ?? "#38bdf8");
  const shortBrand = product.name
    .replace("Mercedes-Benz", "MERCEDES")
    .replace("New Balance", "NB")
    .replace("Louis Vuitton", "LV")
    .replace("The North Face", "TNF")
    .replace("Stone Island", "SI")
    .replace("Under Armour", "UA")
    .split(" ")[0]
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 9) || "RP";

  rect(0, 0, WIDTH, HEIGHT, background);
  rect(42, 42, WIDTH - 84, HEIGHT - 84, panel);
  rect(42, 520, WIDTH - 84, 120, hex("#111827"));
  drawText(shortBrand, 250, 84, 4, white);

  if (product.kind === "cars") {
    rect(42, 420, WIDTH - 84, 100, hex("#334155"));
    rect(110, 405, 420, 15, hex("#64748b"));
    if (product.name.toLowerCase().includes("танк")) {
      rect(170, 325, 300, 100, accent);
      rect(250, 270, 140, 65, accent);
      line(320, 285, 520, 260, 16, accent);
      circle(220, 430, 34, dark);
      circle(420, 430, 34, dark);
      circle(220, 430, 14, hex("#94a3b8"));
      circle(420, 430, 14, hex("#94a3b8"));
    } else {
      rect(120, 340, 400, 85, accent);
      line(190, 340, 245, 285, 10, accent);
      line(245, 285, 390, 285, 10, accent);
      line(390, 285, 450, 340, 10, accent);
      rect(245, 300, 62, 35, hex("#bae6fd"));
      rect(320, 300, 72, 35, hex("#bae6fd"));
      circle(205, 430, 32, dark);
      circle(435, 430, 32, dark);
      circle(205, 430, 13, hex("#cbd5e1"));
      circle(435, 430, 13, hex("#cbd5e1"));
    }
  } else {
    rect(118, 320, 404, 200, accent);
    line(94, 320, 320, 170, 8, hex("#f8fafc"));
    line(320, 170, 546, 320, 8, hex("#f8fafc"));
    rect(265, 400, 90, 120, hex("#78350f"));
    rect(165, 365, 66, 66, hex("#bae6fd"));
    rect(407, 365, 66, 66, hex("#bae6fd"));
    if (product.name.toLowerCase().includes("пентхаус") || product.name.toLowerCase().includes("вилла")) {
      rect(510, 265, 24, 165, hex("#94a3b8"));
      circle(522, 245, 25, hex("#34d399"));
    }
  }
  drawText(product.name.replace(/[^a-z0-9 ]/gi, "").slice(0, 18) || "RP CITY", 110, 555, 3, white);
  return makePng(pixels);
}
