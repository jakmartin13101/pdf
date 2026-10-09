// Renders the BuildSuite Takeoff Studio icon to every size the desktop app and installer need.
//   node scripts/build-icons.mjs                      -> from branding/takeoff-icon.svg (vector redraw)
//   node scripts/build-icons.mjs --source sheet.png   -> crop the Takeoff tile from the BuildSuite icon sheet
//        [--crop x,y,size]  crop square in source pixels (default 70,662,196 on a 1536x1024 sheet, scaled)
// Outputs: build/icon.ico, build/icon.png (512), build/installerSidebar.bmp, build/icons/<size>.png, public/brand/*.
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

async function render(size, raw = false) {
  const b64 = await page.evaluate(
    async ({ size, src, crop, raw }) => {
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
      if (raw) {
        const px = ctx.getImageData(0, 0, size, size).data;
        let bin = '';
        for (let i = 0; i < px.length; i++) bin += String.fromCharCode(px[i]);
        return btoa(bin);
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    { size, src: srcFor(size), crop: cropRect, raw },
  );
  return Buffer.from(b64, 'base64');
}

/** Installer welcome/finish sidebar (NSIS: 164x314). Returns RGBA pixels. */
async function renderSidebar(w, h) {
  const b64 = await page.evaluate(
    async ({ w, h, src, crop }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.getElementById('c');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0f8f8a');
      g.addColorStop(1, '#0b3d4f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // faint drawing grid
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let x = 0.5; x < w; x += 12) (ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, h), ctx.stroke());
      for (let y = 0.5; y < h; y += 12) (ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(w, y), ctx.stroke());
      const s = 104;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      if (crop) ctx.drawImage(img, crop.x, crop.y, crop.s, crop.s, (w - s) / 2, 40, s, s);
      else ctx.drawImage(img, (w - s) / 2, 40, s, s);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '600 13px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('BuildSuite', w / 2, 178);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 19px "Segoe UI", Arial, sans-serif';
      ctx.fillText('Takeoff Studio', w / 2, 202);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '11px "Segoe UI", Arial, sans-serif';
      ctx.fillText('Measure  \u00b7  Count  \u00b7  Takeoff', w / 2, 226);
      const px = ctx.getImageData(0, 0, w, h).data;
      let bin = '';
      for (let i = 0; i < px.length; i++) bin += String.fromCharCode(px[i]);
      return btoa(bin);
    },
    { w, h, src: srcFor(256), crop: cropRect },
  );
  return Buffer.from(b64, 'base64');
}

/** 24-bit bottom-up BMP from RGBA pixels (alpha composited on black). */
function bmp24(rgba, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o + x * 3] = rgba[i + 2];
      buf[o + x * 3 + 1] = rgba[i + 1];
      buf[o + x * 3 + 2] = rgba[i];
    }
  }
  return buf;
}

/** 32-bit DIB icon image (BGRA, bottom-up, with an empty AND mask) for classic ICO readers. */
function icoDib(rgba, s) {
  const mask = Math.ceil(s / 32) * 4 * s;
  const buf = Buffer.alloc(40 + s * s * 4 + mask);
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(s, 4);
  buf.writeInt32LE(s * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(s * s * 4 + mask, 20);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const o = 40 + ((s - 1 - y) * s + x) * 4;
      buf[o] = rgba[i + 2];
      buf[o + 1] = rgba[i + 1];
      buf[o + 2] = rgba[i];
      buf[o + 3] = rgba[i + 3];
    }
  }
  return buf;
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
const icoImages = {};
for (const s of SIZES) {
  pngs[s] = await render(s);
  writeFileSync(join(root, `build/icons/${s}.png`), pngs[s]);
  // 256px is stored as PNG (Vista+); smaller sizes as classic DIBs, which every ICO reader (NSIS included) accepts.
  if (ICO_SIZES.includes(s)) icoImages[s] = s >= 256 ? pngs[s] : icoDib(await render(s, true), s);
}
writeFileSync(join(root, 'build/installerSidebar.bmp'), bmp24(await renderSidebar(164, 314), 164, 314));
await browser.close();

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
  header.writeUInt32LE(icoImages[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += icoImages[s].length;
});
writeFileSync(join(root, 'build/icon.ico'), Buffer.concat([header, ...ICO_SIZES.map((s) => icoImages[s])]));
writeFileSync(join(root, 'build/icon.png'), pngs[512]);
writeFileSync(join(root, 'public/brand/icon-256.png'), pngs[256]);
writeFileSync(join(root, 'public/brand/icon-64.png'), pngs[64]);
if (!source) {
  copyFileSync(join(root, 'branding/takeoff-icon.svg'), join(root, 'public/brand/takeoff-icon.svg'));
  copyFileSync(join(root, 'branding/takeoff-icon-small.svg'), join(root, 'public/favicon.svg'));
}
console.log('Icons written to build/ and public/brand/');
