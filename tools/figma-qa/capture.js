#!/usr/bin/env node
// Снимает страницу сайта для сверки с Figma.
// Для каждой ширины экрана сохраняет:
//   screenshot-<w>.png    — полный скриншот страницы
//   dom-<w>.json          — видимые элементы: селектор, текст, координаты, вычисленные стили
//   section-<w>-<id>.png  — скриншоты отдельных секций (если задан --sections)
//   runtime-<w>.json      — ошибки консоли, упавшие запросы, битые картинки
//
// Пример:
//   node tools/figma-qa/capture.js --url http://localhost:3000/ --out qa-reports/home \
//        --widths 1440,768,375 --sections "header,.hero,#implants,#doctor,footer"

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function args() {
  const a = process.argv.slice(2);
  const o = { widths: '1440', height: '900', sections: '', wait: '800', scale: '1' };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'true';
  }
  if (!o.url || !o.out) {
    console.error('Usage: capture.js --url <page> --out <dir> [--widths 1440,768,375] [--height 900] [--sections "sel1,sel2"] [--wait ms] [--scale 1|2]');
    process.exit(2);
  }
  return o;
}

const STYLE_PROPS = [
  'display', 'position', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line', 'color',
  'background-color', 'background-image', 'border-top-width', 'border-top-style', 'border-top-color',
  'border-radius', 'box-shadow', 'opacity', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'margin-top', 'margin-bottom', 'gap', 'justify-content', 'align-items', 'object-fit',
];

async function collect(page, props) {
  return page.evaluate((props) => {
    const sel = (el) => {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      while (el && el.nodeType === 1 && el !== document.body) {
        let p = el.tagName.toLowerCase();
        if (el.id) { parts.unshift('#' + CSS.escape(el.id) + (parts.length ? '' : '')); break; }
        const cls = [...el.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join('');
        p += cls;
        const sib = el.parentElement ? [...el.parentElement.children].filter((s) => s.tagName === el.tagName) : [];
        if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(el) + 1})`;
        parts.unshift(p);
        el = el.parentElement;
      }
      return parts.join(' > ');
    };
    const out = [];
    const all = document.body.querySelectorAll('*');
    for (const el of all) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SYMBOL', 'DEFS'].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const isLeaf = el.children.length === 0;
      const interesting = ownText || isLeaf || ['IMG', 'SVG', 'BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SECTION', 'HEADER', 'FOOTER', 'NAV'].includes(el.tagName.toUpperCase()) ||
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
      if (!interesting) continue;
      const style = {};
      for (const p of props) style[p] = cs.getPropertyValue(p);
      const item = {
        selector: sel(el),
        tag: el.tagName.toLowerCase(),
        text: ownText.slice(0, 160),
        rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        style,
      };
      if (el.tagName === 'IMG') Object.assign(item, { src: el.currentSrc || el.src, alt: el.alt, natural: [el.naturalWidth, el.naturalHeight], broken: !!(el.currentSrc || el.getAttribute('src')) && el.complete && el.naturalWidth === 0, emptySrc: !(el.currentSrc || el.getAttribute('src')) });
      if (el.tagName === 'A') item.href = el.getAttribute('href');
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && ownText) item.textOverflow = true;
      out.push(item);
    }
    const doc = document.documentElement;
    return {
      title: document.title,
      lang: doc.lang,
      pageSize: { w: doc.scrollWidth, h: doc.scrollHeight },
      viewport: { w: innerWidth, h: innerHeight },
      horizontalScroll: doc.scrollWidth > innerWidth,
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
      elements: out,
    };
  }, props);
}

(async () => {
  const o = args();
  fs.mkdirSync(o.out, { recursive: true });
  const browser = await chromium.launch();
  const widths = o.widths.split(',').map((s) => parseInt(s, 10)).filter(Boolean);
  const sections = o.sections ? o.sections.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const summary = [];

  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: parseInt(o.height, 10) }, deviceScaleFactor: parseFloat(o.scale) });
    const page = await ctx.newPage();
    const runtime = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
    page.on('console', (m) => { if (m.type() === 'error') runtime.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => runtime.pageErrors.push(String(e)));
    page.on('requestfailed', (r) => runtime.failedRequests.push(`${r.url()} — ${r.failure() && r.failure().errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) runtime.httpErrors.push(`${r.status()} ${r.url()}`); });

    await page.goto(o.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    // Прокрутка вниз, чтобы сработали lazy-load и анимации появления
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(parseInt(o.wait, 10));

    const shot = path.join(o.out, `screenshot-${w}.png`);
    await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' });
    const dom = await collect(page, STYLE_PROPS);
    fs.writeFileSync(path.join(o.out, `dom-${w}.json`), JSON.stringify(dom, null, 1));

    const sectionShots = [];
    for (const s of sections) {
      const loc = page.locator(s).first();
      if (!(await loc.count())) { sectionShots.push({ selector: s, missing: true }); continue; }
      const file = path.join(o.out, `section-${w}-${s.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')}.png`);
      await loc.screenshot({ path: file, animations: 'disabled' });
      const box = await loc.boundingBox();
      sectionShots.push({ selector: s, file, box });
    }
    runtime.brokenImages = dom.elements.filter((e) => e.broken).map((e) => e.src);
    runtime.visibleImagesWithoutSrc = dom.elements.filter((e) => e.emptySrc).map((e) => e.selector);
    runtime.horizontalScroll = dom.horizontalScroll;
    runtime.sections = sectionShots;
    fs.writeFileSync(path.join(o.out, `runtime-${w}.json`), JSON.stringify(runtime, null, 1));
    summary.push({ width: w, screenshot: shot, elements: dom.elements.length, pageSize: dom.pageSize, ...runtime });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(o.out, 'capture-summary.json'), JSON.stringify({ url: o.url, date: new Date().toISOString(), viewports: summary }, null, 1));
  for (const s of summary) {
    console.log(`[${s.width}px] ${s.elements} элементов, страница ${s.pageSize.w}×${s.pageSize.h}, ` +
      `ошибок консоли ${s.consoleErrors.length + s.pageErrors.length}, HTTP-ошибок ${s.httpErrors.length}, ` +
      `битых картинок ${s.brokenImages.length}, гориз. скролл: ${s.horizontalScroll ? 'ДА' : 'нет'}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
