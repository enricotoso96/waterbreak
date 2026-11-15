// Renders the WaterBreak droplet icon to PNG without dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function inside(x, y) { // unit coords 0..1
  const cx = .5, cy = .6, r = .227, tip = .18;
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return 'w';
  if (y >= tip && y <= cy) { const hw = ((y - tip) / (cy - tip)) ** 1.15 * r; if (Math.abs(x - cx) <= hw) return 'w'; }
  return 'b';
}
for (const size of [180, 192, 512]) {
  const raw = Buffer.alloc(size * (size * 4 + 1)); const S = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let w = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside((x + (sx + .5) / S) / size, (y + (sy + .5) / S) / size) === 'w') w++;
      const a = w / (S * S), t = y / size;
      const bg = [26 + (11 - 26) * t, 163 + (95 - 163) * t, 232 + (181 - 232) * t];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = bg[0] + (255 - bg[0]) * a; raw[o + 1] = bg[1] + (255 - bg[1]) * a; raw[o + 2] = bg[2] + (255 - bg[2]) * a; raw[o + 3] = 255;
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
console.log('icons written');
