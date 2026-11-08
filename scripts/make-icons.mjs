// Generates public/icon-192.png and public/icon-512.png (no dependencies).
// Same motorbike design as public/icon.svg, rendered with 4x4 anti-aliasing.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Bike geometry in the 64x48 logo space, placed like the SVG: translate(64,88) scale(6) on 512.
const T = (x, y) => [64 + x * 6, 88 + y * 6];
const segs = [
  // [x1,y1,x2,y2,width]
  [17, 35, 25, 24, 3],
  [25, 24, 40, 24, 3],
  [40, 24, 49, 35, 3],
  [27, 24, 32, 35, 2.6],
  [32, 35, 40, 35, 2.6],
  [21, 21, 31, 21, 3.6],
  [49, 35, 43, 14, 2.8],
  [39, 13, 46, 13, 2.8],
  [17, 29, 17, 41, 1.4],
  [11, 35, 23, 35, 1.4],
  [49, 29, 49, 41, 1.4],
  [43, 35, 55, 35, 1.4],
  [32, 22, 40, 22, 3.4], // tank (filled shape approximated by a thick bar)
].map(([a, b, c, d, w]) => [...T(a, b), ...T(c, d), w * 6]);
const rings = [
  [...T(17, 35), 8.5 * 6, 3 * 6],
  [...T(49, 35), 8.5 * 6, 3 * 6],
];

function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isBike(x, y) {
  for (const [x1, y1, x2, y2, w] of segs) if (distSeg(x, y, x1, y1, x2, y2) <= w / 2) return true;
  for (const [cx, cy, r, w] of rings)
    if (Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2) return true;
  return false;
}
function isRoad(x, y) {
  return y > 395 && y < 405 && x > 120 && x < 392 && (x - 120) % 64 < 40;
}

function bg(x, y) {
  // 135deg gradient #0B1B45 -> #1A3A9A (58%) -> #2F6DF6
  const t = (x + y) / 1024;
  const a = [11, 27, 69];
  const b = [26, 58, 154];
  const c = [47, 109, 246];
  const mix = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
  let col = t < 0.58 ? mix(a, b, t / 0.58) : mix(b, c, (t - 0.58) / 0.42);
  if (Math.hypot(x - 420, y - 80) < 150) col = mix(col, [255, 255, 255], 0.06);
  return col;
}

function makeIcon(size) {
  const s = size / 512;
  const SS = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / s;
          const py = (y + (sy + 0.5) / SS) / s;
          let col = bg(px, py); // full bleed so it also works as a maskable icon
          if (isRoad(px, py)) col = [147, 197, 253];
          if (isBike(px, py)) col = [255, 255, 255];
          r += col[0];
          g += col[1];
          b += col[2];
        }
      }
      const n = SS * SS;
      row.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), makeIcon(size));
  console.log(`wrote public/icon-${size}.png`);
}
