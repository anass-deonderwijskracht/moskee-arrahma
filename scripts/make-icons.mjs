// Genereer de PWA-iconen uit het bronlogo — geen externe afhankelijkheden, dus
// alleen zlib uit Node zelf. Voldoende voor één vierkant, niet-geïnterlacet
// bronbestand; het draait eenmalig en het resultaat wordt gecommit.
//   node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const SRC = "public/branding/moskee-arrahma-logo.png";
const OUT = [
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
  { path: "public/icons/apple-touch-icon.png", size: 180 },
];
// Achtergrond waarop transparantie wordt platgeslagen: iOS ondersteunt geen
// doorzichtige app-iconen en maakt ze anders zwart.
const BG = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function readChunks(buf) {
  const chunks = [];
  let p = 8; // PNG-signature
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    chunks.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return chunks;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodeer naar platte RGB-pixels (alpha op BG gelegd). */
function decode(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (depth !== 8) throw new Error(`alleen 8-bits kleurdiepte, kreeg ${depth}`);
  if (interlace !== 0) throw new Error("interlaced PNG wordt niet ondersteund");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`kleurtype ${colorType} wordt niet ondersteund`);

  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      cur[x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b
        : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
  }

  // Naar RGB, met alpha over de achtergrond.
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r, g, bl, alpha = 255;
    if (colorType === 0) { r = g = bl = out[s]; }
    else if (colorType === 4) { r = g = bl = out[s]; alpha = out[s + 1]; }
    else if (colorType === 2) { r = out[s]; g = out[s + 1]; bl = out[s + 2]; }
    else { r = out[s]; g = out[s + 1]; bl = out[s + 2]; alpha = out[s + 3]; }
    const t = alpha / 255;
    rgb[i * 3] = Math.round(r * t + BG[0] * (1 - t));
    rgb[i * 3 + 1] = Math.round(g * t + BG[1] * (1 - t));
    rgb[i * 3 + 2] = Math.round(bl * t + BG[2] * (1 - t));
  }
  return { width, height, rgb };
}

/** Verkleinen door middeling over het bronvlak per doelpixel (box filter). */
function resize(src, size) {
  const out = Buffer.alloc(size * size * 3);
  const sx = src.width / size, sy = src.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 3;
          r += src.rgb[i]; g += src.rgb[i + 1]; b += src.rgb[i + 2]; n++;
        }
      }
      const o = (y * size + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

function encode(rgb, size) {
  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // geen filter — zlib doet het zware werk
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bits truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const src = decode(readFileSync(SRC));
console.log(`bron ${src.width}×${src.height}`);
for (const { path, size } of OUT) {
  const png = encode(resize(src, size), size);
  writeFileSync(path, png);
  console.log(`${path} — ${size}×${size}, ${(png.length / 1024).toFixed(1)} kB`);
}
