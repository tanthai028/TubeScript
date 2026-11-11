// Draws the TubeScript icon (teal rounded square, three white "transcript" lines) as PNGs in icons/.
// No dependencies: shapes are rasterized with 4x4 supersampling and encoded with Node's zlib.
// Usage: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const BG = [0x1a, 0x74, 0x86]; // the panel's accent teal
const FG = [0xff, 0xff, 0xff];
const SS = 4; // supersampling per axis

/** Signed-distance-ish test: is (x, y) inside a rounded rectangle? Coordinates in 0..1 units. */
function inRoundRect(x, y, left, top, right, bottom, r) {
  const cx = Math.min(Math.max(x, left + r), right - r);
  const cy = Math.min(Math.max(y, top + r), bottom - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= left && x <= right && y >= top && y <= bottom;
}

/** Three left-aligned text lines, the last one shorter. */
const LINES = [
  { top: 0.3, width: 0.62 },
  { top: 0.455, width: 0.62 },
  { top: 0.61, width: 0.4 },
];
const LINE_LEFT = 0.19;
const LINE_HEIGHT = 0.1;

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxl + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (!inRoundRect(x, y, 0, 0, 1, 1, 0.22)) continue;
          bg++;
          const onLine = LINES.some((l) =>
            inRoundRect(x, y, LINE_LEFT, l.top, LINE_LEFT + l.width, l.top + LINE_HEIGHT, LINE_HEIGHT / 2),
          );
          if (onLine) fg++;
        }
      }
      const n = SS * SS;
      const alpha = bg / n;
      const mix = bg ? fg / bg : 0;
      const i = (py * size + pxl) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix);
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, px);
}

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of SIZES) {
  writeFileSync(`icons/icon${size}.png`, draw(size));
  console.log(`icons/icon${size}.png`);
}
