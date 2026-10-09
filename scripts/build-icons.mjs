// Renders the BuildSuite Takeoff Studio icon to every size the desktop app and installer need.
//   node scripts/build-icons.mjs                      -> from branding/takeoff-icon.svg (vector redraw)
//   node scripts/build-icons.mjs --source sheet.png   -> crop the Takeoff tile from the BuildSuite icon sheet
//        [--crop x,y,size]  crop square in source pixels (default 70,662,196 on a 1536x1024 sheet, scaled)
// Outputs: build/icon.ico, build/icon.png (512), build/icons/<size>.png, public/brand/*.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const source = opt('--source');
const cropArg = opt('--crop');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const big = readFileSync(join(root, 'branding/takeoff-icon.svg'), 'utf8');
const small = readFileSync(join(root, 'branding/takeoff-icon-small.svg'), 'utf8');
const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

async function render(size) {
  const b64 = await page.evaluate(
    async ({ size, src, crop }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.getElementById('c');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingQuality = 'high';
      if (crop) ctx.drawImage(img, crop.x, crop.y, crop.s, crop.s, 0, 0, size, size);
      else ctx.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png').split(',')[1];
    },
    { size, src: srcFor(size), crop: cropRect },
  );
  return Buffer.from(b64, 'base64');
}

let cropRect = null;
let sourceUrl = null;
if (source) {
  const buf = readFileSync(resolve(source));
  sourceUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const width = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img.naturalWidth;
  }, sourceUrl);
  const k = width / 1536;
  const [x, y, s] = (cropArg ?? '70,662,196').split(',').map(Number);
  cropRect = cropArg ? { x, y, s } : { x: x * k, y: y * k, s: s * k };
  console.log('Cropping Takeoff tile from', source, cropRect);
}
function srcFor(size) {
  if (sourceUrl) return sourceUrl;
  return dataUrl(size <= 32 ? small : big);
}

mkdirSync(join(root, 'build/icons'), { recursive: true });
mkdirSync(join(root, 'public/brand'), { recursive: true });
const pngs = {};
for (const s of SIZES) {
  pngs[s] = await render(s);
  writeFileSync(join(root, `build/icons/${s}.png`), pngs[s]);
}
await browser.close();

// ICO with embedded PNG images (supported since Windows Vista).
const count = ICO_SIZES.length;
const header = Buffer.alloc(6 + 16 * count);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);
let offset = header.length;
ICO_SIZES.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[s].length;
});
writeFileSync(join(root, 'build/icon.ico'), Buffer.concat([header, ...ICO_SIZES.map((s) => pngs[s])]));
writeFileSync(join(root, 'build/icon.png'), pngs[512]);
writeFileSync(join(root, 'public/brand/icon-256.png'), pngs[256]);
writeFileSync(join(root, 'public/brand/icon-64.png'), pngs[64]);
if (!source) {
  copyFileSync(join(root, 'branding/takeoff-icon.svg'), join(root, 'public/brand/takeoff-icon.svg'));
  copyFileSync(join(root, 'branding/takeoff-icon-small.svg'), join(root, 'public/favicon.svg'));
}
console.log('Icons written to build/ and public/brand/');
