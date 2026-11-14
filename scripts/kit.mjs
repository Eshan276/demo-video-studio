/**
 * demo-video-studio recording kit.
 *
 * Drive a real browser through your product, show title cards / terminal replays between scenes, and caption
 * every beat. Frames are captured with the Chrome DevTools screencast (each with its wall-clock time), so the
 * final video keeps the real timing; anything wrapped in `studio.cut()` (page loads, waiting for data) is removed.
 *
 *   import { createStudio } from '<skill>/scripts/kit.mjs';
 *   const s = await createStudio({ out: 'demo/out', title: 'Acme', theme: { accent: '#2563eb' } });
 *   await s.start();
 *   await s.card(s.titleCard({ kicker: 'Acme', title: 'Invoices that<br>pay themselves', lead: '…' }));
 *   s.cap('Acme turns an invoice into a payment link in one click.'); await s.wait(4500);
 *   await s.open('http://localhost:3000/dashboard');
 *   s.cap('…'); await s.click('New invoice'); await s.wait(3000);
 *   await s.finish();
 *
 * Outputs in `out/`: frames/*.jpg, frames.json, captions.json, skips.json, meta.json.
 * Then: node <skill>/scripts/compose.mjs --out demo/out
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, 'package.json'));

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    throw new Error(`puppeteer-core is not installed. Run:  npm install --prefix ${here}`);
  }
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable', '/bin/google-chrome-stable', '/usr/bin/google-chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to its executable.');
  return hit;
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_THEME = {
  bg: '#f8f7f4', fg: '#0b0a09', muted: '#6e655d', faint: '#a39b92', line: '#e3dfd8', panel: '#f1efea',
  accent: '#2563eb',
  dark: { bg: '#0e0c0a', fg: '#ece8e1', muted: '#8a8178', line: '#2a2520', panel: '#100e0c' },
  font: "'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
  fontFiles: {},          // { sans: '/path/Inter.woff2', mono: '/path/JetBrainsMono.woff2' } — embedded, no network needed
  subtitles: { font: 'Noto Sans', size: 40, text: '#f8f7f4', box: '#0b0a09', boxAlpha: 0.85 },
};

function mergeTheme(t = {}) {
  return {
    ...DEFAULT_THEME, ...t,
    dark: { ...DEFAULT_THEME.dark, ...(t.dark ?? {}) },
    fontFiles: { ...(t.fontFiles ?? {}) },
    subtitles: { ...DEFAULT_THEME.subtitles, ...(t.subtitles ?? {}) },
  };
}

function cardCss(th) {
  const face = (family, file) => (file && existsSync(file)
    ? `@font-face{font-family:'${family}';font-weight:300 800;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2')}`
    : '');
  return `${face('StudioSans', th.fontFiles.sans)}${face('StudioMono', th.fontFiles.mono)}
:root{--bg:${th.bg};--fg:${th.fg};--muted:${th.muted};--faint:${th.faint};--line:${th.line};--panel:${th.panel};--accent:${th.accent};
--sans:${th.fontFiles.sans ? "'StudioSans'," : ''}${th.font};--mono:${th.fontFiles.mono ? "'StudioMono'," : ''}${th.mono}}
body.dark{--bg:${th.dark.bg};--fg:${th.dark.fg};--muted:${th.dark.muted};--line:${th.dark.line};--panel:${th.dark.panel}}
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:var(--bg);color:var(--fg);font-family:var(--sans);-webkit-font-smoothing:antialiased}
body{display:grid;place-items:center;padding:70px 90px}
.wrap{width:100%;max-width:1220px}
.in{animation:in .7s cubic-bezier(.2,.7,.2,1) both}
.kicker{font-family:var(--mono);font-size:15px;color:var(--muted);display:flex;align-items:center;gap:14px;letter-spacing:.02em}
.kicker:before{content:'';width:34px;height:1px;background:var(--muted)}
h1{font-weight:400;letter-spacing:-.035em;line-height:.98;font-size:112px;margin-top:26px}
h2{font-weight:400;letter-spacing:-.03em;line-height:1.04;font-size:62px;margin-top:22px}
.m{color:var(--muted)} .accent{color:var(--accent)}
.lead{font-size:26px;line-height:1.5;color:var(--muted);margin-top:26px;max-width:900px}
.mono{font-family:var(--mono)}
.cols{display:grid;grid-template-columns:repeat(var(--n,2),1fr);gap:24px;margin-top:44px}
.box{border:1px solid var(--line);padding:28px 30px;background:var(--bg)}
.box.inv{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.box .k{font-family:var(--mono);font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.box .big{font-size:32px;letter-spacing:-.02em;margin-top:14px}
.box ul{margin-top:16px;padding:0;list-style:none;font-size:21px;line-height:1.75}
.box li:before{content:'— ';color:var(--faint)}
.rows{margin-top:36px;border:1px solid var(--line)}
.row{display:grid;grid-template-columns:260px 1fr;gap:20px;padding:17px 26px;border-top:1px solid var(--line);align-items:baseline}
.row:first-child{border-top:0}
.row .l{font-family:var(--mono);font-size:14px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.row .v{font-family:var(--mono);font-size:19px;word-break:break-all}
.term{border:1px solid var(--line);background:var(--panel);margin-top:36px}
body:not(.dark) .term{background:#100e0c;border-color:#2a2520;color:#ece8e1}
.term .bar{display:flex;align-items:center;gap:9px;padding:14px 20px;border-bottom:1px solid #2a2520;font-family:var(--mono);font-size:13px;color:#8a8178}
.term .bar i{width:11px;height:11px;border-radius:50%;background:#3a342e;display:inline-block}
.term .bar span{margin-left:auto}
.term pre{font-family:var(--mono);font-size:20px;line-height:1.75;padding:24px 28px;white-space:pre-wrap;word-break:break-word;color:#ece8e1}
.term .d{color:#8a8178}.term .ok{color:#4ade80}.term .bad{color:#f87171}.term .y{color:#e9d8a6}
.ln{opacity:0;animation:in .35s ease-out both}
.foot{margin-top:26px;font-family:var(--mono);font-size:15px;color:var(--muted)}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`;
}

export async function createStudio(opts = {}) {
  const OUT = resolve(opts.out ?? 'demo/out');
  const width = opts.width ?? 1440;
  const height = opts.height ?? 810;
  const scale = opts.scale ?? 4 / 3; // 1440×810 CSS px → 1920×1080 video
  const theme = mergeTheme(opts.theme);
  const css = cardCss(theme) + (opts.extraCss ?? '');

  rmSync(resolve(OUT, 'frames'), { recursive: true, force: true });
  mkdirSync(resolve(OUT, 'frames'), { recursive: true });

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: opts.headless ?? true,
    args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', ...(opts.chromeArgs ?? [])],
    defaultViewport: { width, height, deviceScaleFactor: scale },
  });
  const page = await browser.newPage();
  if (opts.userAgent) await page.setUserAgent(opts.userAgent);
  page.on('pageerror', (e) => console.warn('pageerror:', e.message));

  // Visible cursor + click ripple: headless screencasts have no cursor.
  if (opts.cursor !== false) {
    await page.evaluateOnNewDocument((color) => {
      const install = () => {
        if (document.getElementById('__studio_cursor')) return;
        const c = document.createElement('div');
        c.id = '__studio_cursor';
        Object.assign(c.style, { position: 'fixed', left: `${window.__cx ?? -50}px`, top: `${window.__cy ?? -50}px`, width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(11,10,9,.85)', border: '2px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,.35)', transform: 'translate(-50%,-50%)', zIndex: '2147483647', pointerEvents: 'none', transition: 'width 120ms, height 120ms' });
        document.documentElement.appendChild(c);
        document.addEventListener('mousemove', (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, true);
        document.addEventListener('mousedown', (e) => {
          c.style.width = c.style.height = '16px';
          const r = document.createElement('div');
          Object.assign(r.style, { position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`, width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${color}`, transform: 'translate(-50%,-50%)', zIndex: '2147483646', pointerEvents: 'none', transition: 'all 450ms ease-out' });
          document.documentElement.appendChild(r);
          requestAnimationFrame(() => Object.assign(r.style, { width: '56px', height: '56px', opacity: '0' }));
          setTimeout(() => r.remove(), 500);
        }, true);
        document.addEventListener('mouseup', () => { c.style.width = c.style.height = '22px'; }, true);
      };
      document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install) : install();
    }, theme.accent);
  }

  const frames = [];
  const captions = [];
  const skips = [];
  let t0 = 0;
  let started = false;
  const now = () => (Date.now() - t0) / 1000;

  const cdp = await page.createCDPSession();
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    if (started) {
      const name = `f${String(frames.length).padStart(6, '0')}.jpg`;
      writeFileSync(resolve(OUT, 'frames', name), Buffer.from(data, 'base64'));
      frames.push({ name, t: Date.now() / 1000 - t0 / 1000 });
    }
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  const s = {
    page, browser, theme, out: OUT,
    esc, sleep,
    now,

    async start() {
      t0 = Date.now();
      started = true;
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: Math.round(width * scale), maxHeight: Math.round(height * scale), everyNthFrame: 1 });
    },

    /** Show a subtitle from now until the next cap()/capOff(). One idea per line, under ~80 characters. */
    cap(text) {
      const t = now();
      const prev = captions.at(-1);
      if (prev && prev.end === null) prev.end = t;
      captions.push({ start: t, end: null, text });
      console.log(`[${t.toFixed(1)}s] ${text}`);
    },
    capOff() {
      const p = captions.at(-1);
      if (p && p.end === null) p.end = now();
    },
    wait: (ms) => sleep(ms),

    /** Everything inside is cut from the final video (page loads, waiting for data). Ends the current subtitle. */
    async cut(fn) {
      s.capOff();
      const a = now();
      const r = await fn();
      skips.push([a, now()]);
      return r;
    },

    /** Navigate (inside a cut). `ready`: CSS selector or page function that must be truthy; `settle`: extra ms. */
    async open(url, { ready, settle = 1200, timeout = 60000 } = {}) {
      await s.cut(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        if (typeof ready === 'string') await page.waitForSelector(ready, { timeout });
        else if (typeof ready === 'function') await page.waitForFunction(ready, { timeout, polling: 250 });
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await sleep(settle);
      });
    },

    /** Full-screen card in the theme. `dark: true` for the dark variant. Loads inside a cut. */
    async card(html, { dark = false, settle = 250 } = {}) {
      await s.cut(async () => {
        if (!page.url().startsWith('about:')) await page.goto('about:blank');
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="${dark ? 'dark' : ''}"><div class="wrap in">${html}</div></body></html>`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await sleep(settle);
      });
    },

    /** Common card layouts (return HTML for s.card). */
    titleCard: ({ kicker = '', title, lead = '' }) =>
      `${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}`,
    sectionCard: ({ kicker = '', title, sub = '', body = '' }) =>
      `${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h2>${title}${sub ? `<br><span class="m">${sub}</span>` : ''}</h2>${body}`,
    /** Terminal replay: lines are HTML (escape real output with esc()); they appear one by one. */
    term: (title, lines, stepMs = 420) =>
      `<div class="term"><div class="bar"><i></i><i></i><i></i><span>${esc(title)}</span></div><pre>${lines.map((l, i) => `<div class="ln" style="animation-delay:${400 + i * stepMs}ms">${l || '&nbsp;'}</div>`).join('')}</pre></div>`,
    /** Key/value table, e.g. a transaction or API response decoded for the viewer. */
    rows: (pairs, foot = '') =>
      `<div class="rows">${pairs.map(([k, v]) => `<div class="row"><div class="l">${esc(k)}</div><div class="v">${v}</div></div>`).join('')}</div>${foot ? `<p class="foot">${foot}</p>` : ''}`,

    /** Glide the visible cursor to (x, y). */
    async moveTo(x, y, steps = 28) {
      await page.mouse.move(x, y, { steps });
      await page.evaluate((x, y) => { window.__cx = x; window.__cy = y; }, x, y);
    },

    /** Find a button/link/tab by visible text or aria-label, scroll to it, glide the cursor, click. */
    async click(text, { exact = false, selector = 'button,a,[role=tab],[role=button],summary,label' } = {}) {
      const handle = await page.waitForFunction(
        (text, exact, selector) => [...document.querySelectorAll(selector)].find((el) => {
          const label = (el.innerText || el.getAttribute('aria-label') || '').trim();
          return (exact ? label === text : label.includes(text)) && !el.disabled && el.offsetParent !== null;
        }),
        { timeout: 60000, polling: 250 }, text, exact, selector,
      );
      await handle.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await sleep(550);
      const box = await handle.boundingBox();
      await s.moveTo(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(160);
      await page.mouse.down(); await sleep(60); await page.mouse.up();
      await sleep(250);
    },

    /** Click a field (CSS selector) and type like a person. */
    async type(selector, text, { delay = 28, clear = false } = {}) {
      const h = await page.waitForSelector(selector, { timeout: 60000 });
      await h.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await sleep(400);
      const box = await h.boundingBox();
      await s.moveTo(box.x + Math.min(box.width / 2, 160), box.y + box.height / 2);
      await h.click({ clickCount: clear ? 3 : 1 });
      if (clear) await page.keyboard.press('Backspace');
      await page.keyboard.type(text, { delay });
    },

    /** Smooth-scroll so the element matching `selector` (or containing `text`) sits near the top. */
    async scrollTo(selectorOrText, { offset = -40, wait = 1400 } = {}) {
      await page.evaluate((q, offset) => {
        const el = document.querySelector(q) ?? [...document.querySelectorAll('h1,h2,h3,p,span,li,section,div')].find((e) => e.textContent.trim().startsWith(q));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
      }, selectorOrText, offset);
      await sleep(wait);
    },

    async finish() {
      s.capOff();
      await sleep(400);
      await cdp.send('Page.stopScreencast').catch(() => {});
      writeFileSync(resolve(OUT, 'frames.json'), JSON.stringify(frames));
      writeFileSync(resolve(OUT, 'captions.json'), JSON.stringify(captions, null, 2));
      writeFileSync(resolve(OUT, 'skips.json'), JSON.stringify(skips));
      writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify({ title: opts.title ?? 'Demo', name: opts.name ?? 'demo', subtitles: theme.subtitles, fontFiles: theme.fontFiles, recordedAt: new Date().toISOString() }, null, 2));
      await browser.close();
      const cutSecs = skips.reduce((n, [a, b]) => n + b - a, 0);
      console.log(`${frames.length} frames · ${now().toFixed(1)}s recorded · ${cutSecs.toFixed(1)}s cut · ${captions.length} subtitles → ${OUT}`);
    },
  };
  return s;
}
