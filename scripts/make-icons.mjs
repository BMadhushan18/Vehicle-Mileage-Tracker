// Generates public/icon-192.png and public/icon-512.png (no dependencies).
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

function makeIcon(size) {
  const s = size / 512; // design is on a 512 grid, same as icon.svg
  const blue = [37, 99, 235];
  const light = [147, 197, 253];
  const white = [255, 255, 255];
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s;
      const py = (y + 0.5) / s;
      let color = blue; // full-bleed background so it also works as a maskable icon
      const d = Math.hypot(px - 256, py - 276);
      if (Math.abs(d - 150) < 18) color = white; // dial ring
      if (d < 26) color = white; // hub
      // needle from center toward upper right
      const t = ((px - 256) * 84 + (py - 276) * -80) / (84 * 84 + 80 * 80);
      if (t > 0 && t < 1) {
        const nx = 256 + 84 * t;
        const ny = 276 - 80 * t;
        if (Math.hypot(px - nx, py - ny) < 16) color = white;
      }
      if (py > 366 && py < 394 && px > 150 && px < 362) color = light; // base line
      row.set([...color, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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
