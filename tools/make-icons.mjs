// Generates PNG app icons without dependencies (speech bubble on deep blue).
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pad) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [22, 48, 92], fg = [255, 140, 46], white = [255, 255, 255];
  const s = size, m = s * pad; // safe margin
  const bx0 = m, bx1 = s - m, by0 = m + s * 0.04, by1 = s - m - s * 0.12, r = (bx1 - bx0) * 0.2;
  const inRound = (x, y) => {
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return false;
    const cx = Math.min(Math.max(x, bx0 + r), bx1 - r), cy = Math.min(Math.max(y, by0 + r), by1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const inTail = (x, y) => { const t = (y - by1) / (s * 0.12); return t >= 0 && t <= 1 && x >= bx0 + r && x <= bx0 + r + (1 - t) * s * 0.16; };
  const barH = (by1 - by0) * 0.11, barX0 = bx0 + (bx1 - bx0) * 0.18, cy = (by0 + by1) / 2;
  const bars = [[-2.2, 0.82], [0, 0.82], [2.2, 0.55]].map(([o, w]) => [cy + o * barH - barH / 2, cy + o * barH + barH / 2, barX0 + (bx1 - bx0) * 0.64 * w]);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      let c = bg;
      if (inRound(x, y) || inTail(x, y)) c = fg;
      if (bars.some(([a, b, xe]) => y >= a && y <= b && x >= barX0 && x <= xe)) c = white;
      const i = y * (s * 4 + 1) + 1 + x * 4;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(join(out, 'icon-192.png'), png(192, 0.16));
writeFileSync(join(out, 'icon-512.png'), png(512, 0.16));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, 0.24));
console.log('icons written');
