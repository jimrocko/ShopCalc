/**
 * Erzeugt App-Icons und iOS-Startbildschirme aus public/favicon.svg.
 * Benötigt eine lokale Playwright/Chromium-Installation (z. B. `npx playwright install chromium`).
 * Die erzeugten PNGs sind bereits im Repository enthalten – das Skript ist nur bei Designänderungen nötig.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
await mkdir(new URL('../public/icons', import.meta.url), { recursive: true });
await mkdir(new URL('../public/splash', import.meta.url), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  await page.screenshot({ path: new URL(`../public/${out}`, import.meta.url).pathname, omitBackground: false });
  console.log('✓', out);
}

const icon = (size, pad = 0, bg = 'transparent') =>
  `<div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">
     <img src="${dataUrl}" style="width:${size - pad * 2}px;height:${size - pad * 2}px"/></div>`;

// iOS rundet Icons selbst ab – daher vollflächig mit Hintergrund
const fullBleed = (size) =>
  `<div style="width:${size}px;height:${size}px;background:linear-gradient(135deg,#34d399,#059669);display:flex;align-items:center;justify-content:center">
     <img src="${dataUrl}" style="width:${size}px;height:${size}px;clip-path:inset(0 round 0)"/></div>`;

await render(fullBleed(180), 180, 180, 'apple-touch-icon.png');
await render(icon(192), 192, 192, 'icons/icon-192.png');
await render(icon(512), 512, 512, 'icons/icon-512.png');
await render(icon(512, 64, '#10b981'), 512, 512, 'icons/icon-maskable-512.png');

const splashes = [
  [1320, 2868], [1290, 2796], [1206, 2622], [1179, 2556], [1170, 2532],
  [1284, 2778], [1125, 2436], [828, 1792], [750, 1334],
];
for (const [w, h] of splashes) {
  const s = Math.round(w * 0.28);
  await render(
    `<div style="width:${w}px;height:${h}px;background:#0b0b0f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s * 0.18)}px;font-family:-apple-system,Helvetica,Arial,sans-serif">
       <img src="${dataUrl}" style="width:${s}px;height:${s}px"/>
       <div style="color:#f5f5f7;font-weight:700;font-size:${Math.round(s * 0.22)}px;letter-spacing:-0.02em">ShopCalc</div>
     </div>`,
    w, h, `splash/splash-${w}x${h}.png`,
  );
}
await browser.close();
