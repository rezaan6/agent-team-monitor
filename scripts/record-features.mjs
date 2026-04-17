#!/usr/bin/env node
// Records short Playwright videos of each dashboard feature, then converts
// them to GIFs with ffmpeg. Outputs land in docs/media/.
//
// Usage:
//   node --env-file=.env.local scripts/record-features.mjs
//
// Requires: dev server already running on http://localhost:7777.

import { chromium } from "playwright";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MEDIA = resolve(ROOT, "docs/media");
const VIDEO_DIR = resolve(ROOT, "scripts/recordings");

const BASE = process.env.RECORD_BASE_URL ?? "http://localhost:7777";
const EMAIL = process.env.TEST_EMAIL ?? "test@demo.local";
const PASSWORD = process.env.TEST_PASSWORD ?? "demo-1234";

const VIEWPORT = { width: 1280, height: 800 };

const CURSOR_SCRIPT = `
(() => {
  if (window.__fakeCursorInstalled) return;
  window.__fakeCursorInstalled = true;
  const install = () => {
    const el = document.createElement('div');
    el.id = '__fake_cursor__';
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:22px', 'height:22px',
      'border-radius:50%', 'background:rgba(30,30,30,0.55)',
      'border:2px solid #fff',
      'box-shadow:0 0 0 2px rgba(0,0,0,0.25), 0 4px 14px rgba(0,0,0,0.35)',
      'transform:translate(-50%,-50%)',
      'pointer-events:none', 'z-index:2147483647',
      'transition:width 80ms ease, height 80ms ease, background 80ms ease',
    ].join(';');
    document.documentElement.appendChild(el);
    window.addEventListener('mousemove', (e) => {
      el.style.left = e.clientX + 'px';
      el.style.top = e.clientY + 'px';
    }, { passive: true, capture: true });
    window.addEventListener('mousedown', () => {
      el.style.width = '14px'; el.style.height = '14px';
      el.style.background = 'rgba(59,130,246,0.85)';
    }, { capture: true });
    window.addEventListener('mouseup', () => {
      el.style.width = '22px'; el.style.height = '22px';
      el.style.background = 'rgba(30,30,30,0.55)';
    }, { capture: true });
  };
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();
`;

async function freshContext(browser) {
  // Each clip gets its own context so Playwright writes a single .webm we
  // can identify by save order.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
    colorScheme: "light",
  });
  // Inject a fake cursor into every page so the recording shows where the
  // automated mouse is pointing — Playwright doesn't render the OS cursor
  // into its videos.
  await context.addInitScript(CURSOR_SCRIPT);
  return context;
}

async function moveTo(page, x, y, steps = 20) {
  await page.mouse.move(x, y, { steps });
}

// Circle around a locator's bounding box a few times, then settle on the
// center. Used to visually call out an element before interacting with it.
async function circle(page, locator, { loops = 2, radius = 40, steps = 30 } = {}) {
  const box = await locator.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.max(radius, Math.min(box.width, box.height) / 2 + 16);
  const segments = 24;
  for (let loop = 0; loop < loops; loop++) {
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(t) * r, cy + Math.sin(t) * r, {
        steps: 2,
      });
    }
  }
  await moveTo(page, cx, cy, steps);
  await page.waitForTimeout(250);
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  // Wait for the dashboard to actually finish hydrating.
  await page.waitForSelector("header", { timeout: 15_000 });
  await page.waitForTimeout(1500);
}

async function clip(name, browser, fn) {
  console.log(`  → recording ${name}`);
  const context = await freshContext(browser);
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
  // Playwright names videos by internal GUIDs — rename the most recent .webm.
  const files = await readdir(VIDEO_DIR);
  const webms = files
    .filter((f) => f.endsWith(".webm"))
    .map((f) => join(VIDEO_DIR, f));
  let newest = webms[0];
  let newestMtime = 0;
  for (const f of webms) {
    const { statSync } = await import("node:fs");
    const m = statSync(f).mtimeMs;
    if (m > newestMtime) {
      newestMtime = m;
      newest = f;
    }
  }
  const target = join(VIDEO_DIR, `${name}.webm`);
  if (newest !== target) {
    await rename(newest, target);
  }
  return target;
}

// ---------------------------------------------------------------------------
// Individual clips
// ---------------------------------------------------------------------------

async function recLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await moveTo(page, 200, 200, 1);
  await page.waitForTimeout(600);

  const email = page.locator('input[type="email"]');
  await circle(page, email);
  await email.click();
  await page.keyboard.type(EMAIL, { delay: 35 });
  await page.waitForTimeout(400);

  const pw = page.locator('input[type="password"]');
  await circle(page, pw);
  await pw.click();
  await page.keyboard.type(PASSWORD, { delay: 35 });
  await page.waitForTimeout(400);

  const submit = page.locator('button[type="submit"]');
  await circle(page, submit, { loops: 1 });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await page.waitForTimeout(1500);
}

async function recDashboard(page) {
  // Show the skeleton-to-loaded transition: sign in, then immediately reload
  // so the fresh page renders skeletons while data hydrates.
  await signIn(page);
  await page.reload({ waitUntil: "commit" });
  await moveTo(page, 640, 400, 1);
  await page.waitForTimeout(800);
  // Sweep the cursor across the dashboard to guide the eye while it hydrates.
  await moveTo(page, 240, 220);
  await moveTo(page, 1040, 220);
  await moveTo(page, 1040, 560);
  await moveTo(page, 240, 560);
  await page.waitForTimeout(1200);
}

async function recUserMenu(page) {
  await signIn(page);
  const trigger = page.locator("header button[title]").last();
  await circle(page, trigger);
  await trigger.click();
  await page.waitForTimeout(1800);
  // Close and settle.
  await moveTo(page, 400, 400);
  await page.mouse.click(400, 400);
  await page.waitForTimeout(600);
}

async function recDarkMode(page) {
  await signIn(page);
  const themeBtn = page
    .locator('header button[title*="mode"]')
    .first();
  await circle(page, themeBtn);
  await themeBtn.click();
  await page.waitForTimeout(1200);
  await themeBtn.click();
  await page.waitForTimeout(1000);
}

async function recAgentCard(page) {
  await signIn(page);
  // Click the first expand chevron in the Completed section.
  const firstCard = page.locator("section h3").first();
  await firstCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  // The AgentCard has a chevron toggle; click the card body to expand.
  const expandable = page
    .locator('[class*="cursor-pointer"]')
    .filter({ hasText: /^#/ })
    .first();
  try {
    await circle(page, expandable);
    await expandable.click({ timeout: 3000 });
  } catch {
    // Fallback: click first card container.
    await circle(page, firstCard);
    await firstCard.click();
  }
  await page.waitForTimeout(2500);
}

async function recTimeline(page) {
  await signIn(page);
  // Close the timeline sidebar, then reopen.
  const closeBtn = page.locator('aside button[class*="rounded-md"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await circle(page, closeBtn);
    await closeBtn.click();
    await page.waitForTimeout(1200);
  }
  const openBtn = page.locator('button:has-text("Activity")').first();
  if (await openBtn.isVisible().catch(() => false)) {
    await circle(page, openBtn);
    await openBtn.click();
    await page.waitForTimeout(1500);
  }
}

async function recSections(page) {
  await signIn(page);
  // Collapse Completed, then Failed, then reopen.
  const completed = page.locator('button:has-text("Completed")').first();
  await completed.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await circle(page, completed);
  await completed.click();
  await page.waitForTimeout(1000);
  await completed.click();
  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------------------
// ffmpeg: webm -> palette-optimised gif
// ---------------------------------------------------------------------------

async function toGif(webmPath, name) {
  const out = resolve(MEDIA, `${name}.gif`);
  const palette = resolve(VIDEO_DIR, `${name}.palette.png`);
  const filters = "fps=12,scale=480:-1:flags=lanczos";

  await execFileP("ffmpeg", [
    "-y",
    "-i",
    webmPath,
    "-vf",
    `${filters},palettegen=max_colors=128`,
    palette,
  ]);
  await execFileP("ffmpeg", [
    "-y",
    "-i",
    webmPath,
    "-i",
    palette,
    "-filter_complex",
    `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`,
    out,
  ]);
  console.log(`     ↳ ${out}`);
  return out;
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(MEDIA, { recursive: true });
  await mkdir(VIDEO_DIR, { recursive: true });
  // Clean leftover recordings so rename logic works cleanly.
  for (const f of await readdir(VIDEO_DIR).catch(() => [])) {
    await rm(join(VIDEO_DIR, f));
  }

  console.log(`recording against ${BASE} as ${EMAIL}`);
  const browser = await chromium.launch();
  try {
    const clips = [
      ["login", recLogin],
      ["dashboard", recDashboard],
      ["user-menu", recUserMenu],
      ["dark-mode", recDarkMode],
      ["agent-card", recAgentCard],
      ["timeline", recTimeline],
      ["sections", recSections],
    ];
    const webms = [];
    for (const [name, fn] of clips) {
      const webm = await clip(name, browser, fn);
      webms.push([name, webm]);
    }

    console.log("converting to gifs…");
    for (const [name, webm] of webms) {
      await toGif(webm, name);
    }
    console.log("done.");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
