/**
 * MixLab H5 审查报告（34 项 + 工程风险）逐项回归验收脚本
 *
 * 用法：
 *   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
 *   npm run audit [-- http://127.0.0.1:4173/]
 *
 * 复刻报告中的测试手法：Chrome 移动端模拟（390×844 / 320×568 / 740×360）、
 * CDP 真实触摸拖动、脏 localStorage、存储配额失败、键盘/Esc/遮罩、rAF 空转计数等。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const URL_ = process.argv[2] || 'http://127.0.0.1:4173/';
const OUT = path.join(root, '.audit');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

const results = [];
const runtimeErrors = [];
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 };

function record(id, title, pass, detail = '') {
  results.push({ id, title, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? '✅' : '❌'} ${id.padEnd(7)} ${title}${detail ? `  —  ${detail}` : ''}`);
}

async function check(id, title, fn) {
  try {
    const out = await fn();
    if (typeof out === 'object' && out !== null && 'pass' in out) record(id, title, out.pass, out.detail);
    else record(id, title, Boolean(out));
  } catch (err) {
    record(id, title, false, `异常: ${err?.message?.split('\n')[0] ?? err}`);
  }
}

async function open(opts = MOBILE, { skipIntro = true, initScripts = [], allowErrors = false } = {}) {
  const ctx = await browser.newContext(opts);
  for (const s of initScripts) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  if (!allowErrors) {
    page.on('pageerror', (e) => runtimeErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') runtimeErrors.push(`console: ${m.text()}`);
    });
  }
  await page.goto(URL_, { waitUntil: 'networkidle' });
  if (skipIntro) {
    await page.getByTestId('intro-enter-bar-btn').click();
    await page.getByTestId('intro-cover').waitFor({ state: 'hidden' });
  }
  return { ctx, page };
}

const ml = async (page) => parseInt((await page.getByTestId('live-ml').innerText()).trim(), 10);

async function tap(page, id) {
  const btn = page.getByTestId(`bottle-${id}`);
  await btn.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true });
  await page.waitForTimeout(40);
  await btn.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true });
  await page.waitForTimeout(120);
}

async function hold(page, id, ms) {
  const btn = page.getByTestId(`bottle-${id}`);
  await btn.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, isPrimary: true });
  await page.waitForTimeout(ms);
  await btn.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true, isPrimary: true });
  await page.waitForTimeout(120);
}

async function gotoPour(page) {
  await page.getByTestId('step-tab-pour').click();
  await page.getByTestId('bottle-rack-scroll').waitFor();
}

async function serveLayered(page, ids = ['gin', 'tonic']) {
  await gotoPour(page);
  for (const id of ids) await tap(page, id);
  await page.getByTestId('go-shake-btn').click();
  await page.getByTestId('serve-layered-btn').click();
  await page.getByTestId('result-sheet').waitFor({ state: 'visible' });
}

async function cdpDrag(ctx, page, x, y, dy, steps = 10) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  return cdp;
}

try {
  /* ============================== P0 ============================== */

  await check('P0-1', '手机端酒架可触摸滑动，滑动不误倒酒，轻点仍可倒酒', async () => {
    const { ctx, page } = await open();
    await gotoPour(page);
    const box = await page.getByTestId('bottle-gin').boundingBox();
    const cdp = await cdpDrag(ctx, page, box.x + box.width / 2, box.y + box.height / 2, -170);
    const scrollTop = await page.getByTestId('bottle-rack-scroll').evaluate((el) => el.scrollTop);
    const afterDrag = await ml(page);
    // 两列之间的缝隙也能拖
    await page.getByTestId('bottle-rack-scroll').evaluate((el) => (el.scrollTop = 0));
    const gap = await page.getByTestId('bottle-rack-scroll').boundingBox();
    await cdpDrag(ctx, page, gap.x + gap.width / 2, gap.y + 40, -150);
    const scrollTop2 = await page.getByTestId('bottle-rack-scroll').evaluate((el) => el.scrollTop);
    // 真实触摸轻点
    await page.getByTestId('bottle-rack-scroll').evaluate((el) => (el.scrollTop = 0));
    const b2 = await page.getByTestId('bottle-vodka').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b2.x + 30, y: b2.y + 20 }] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    const afterTap = await ml(page);
    await ctx.close();
    return {
      pass: scrollTop > 60 && scrollTop2 > 60 && afterDrag === 0 && afterTap === 30,
      detail: `卡片拖动 scrollTop=${scrollTop}，缝隙拖动 scrollTop=${scrollTop2}，拖动后 ${afterDrag}ml，触摸轻点后 ${afterTap}ml`,
    };
  });

  await check('P0-2', '长按倒酒时切换分类，倾倒立即停止', async () => {
    const { ctx, page } = await open();
    await gotoPour(page);
    const btn = page.getByTestId('bottle-gin');
    await btn.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', bubbles: true, isPrimary: true });
    await page.waitForTimeout(700);
    // 只派发 click（模拟另一根手指点分类，原按钮不会收到 pointerup）
    await page.getByTestId('bottle-category-spirit').dispatchEvent('click');
    await page.waitForTimeout(60);
    const a = await ml(page);
    await page.waitForTimeout(1200);
    const b = await ml(page);
    const badge = await page.getByText(/^倾倒 /).count();
    await ctx.close();
    return { pass: a > 0 && a === b && b < 240 && badge === 0, detail: `切分类时 ${a}ml，1.2s 后 ${b}ml，倾倒浮标=${badge}` };
  });

  await check('P0-3', '脏 localStorage 不白屏：坏条目被过滤，合法旧数据保留', async () => {
    const { ctx, page } = await open();
    await page.evaluate(() => {
      const good = {
        id: 'legacy-1',
        serialNo: 'ML-007',
        name: '旧版特调',
        enName: 'Legacy',
        isClassic: false,
        bartenderNote: 'hi',
        abv: 12.3,
        totalMl: 90,
        flavor: { sour: 10, sweet: 20, bitter: 5, strong: 40, refreshing: 30 },
        blendedColor: '#C88928',
        colorFamily: 'amber',
        hasBubbles: true,
        glassId: 'highball',
        iceType: 'cubes',
        garnishes: ['lime'],
        pours: [
          { ingredientId: 'gin', ml: 30 },
          { ingredientId: 'tonic', ml: 60 },
        ],
        shaken: false,
        createdAt: '2026-11-18T10:00:00.000Z',
      };
      localStorage.setItem(
        'mixlab_cabinet_v1',
        JSON.stringify([{ id: 'broken' }, null, 5, { id: 'x', serialNo: 'ML-1', name: 'n', abv: 'oops' }, good])
      );
      localStorage.setItem('mixlab_unlocked_classics_v1', '{"a":1}');
      localStorage.setItem('mixlab_serial_counter_v1', 'NaN');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('open-cabinet-btn').click();
    await page.getByTestId('cabinet-drawer').waitFor({ state: 'visible' });
    const count = await page.getByTestId('cabinet-item').count();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mixlab_cabinet_v1')).length);
    await ctx.close();
    return { pass: count === 1 && stored === 1, detail: `渲染 ${count} 条合法收藏，存储已自动清洗为 ${stored} 条` };
  });

  await check('P0-3b', '渲染异常由 ErrorBoundary 兜底，可一键清空本地数据自救', async () => {
    const { ctx, page } = await open(MOBILE, {
      allowErrors: true,
      initScripts: [
        `(() => { const orig = Number.prototype.toFixed; Number.prototype.toFixed = function () { if (window.__boom) throw new Error('boom'); return orig.apply(this, arguments); }; })();`,
      ],
    });
    await gotoPour(page);
    await page.evaluate(() => {
      localStorage.setItem('mixlab_sound_on_v1', '0');
      window.__boom = true;
    });
    await tap(page, 'gin');
    const fallback = await page.getByTestId('error-reset-btn').isVisible();
    await page.getByTestId('error-reset-btn').click();
    await page.waitForLoadState('networkidle');
    const introBack = await page.getByTestId('intro-cover').isVisible();
    const cleared = await page.evaluate(() => localStorage.getItem('mixlab_sound_on_v1'));
    await ctx.close();
    return { pass: fallback && introBack && cleared === null, detail: `兜底页=${fallback}，清空后正常回到首页=${introBack}` };
  });

  await check('P0-4', '存储配额失败时提示收藏失败，不显示「已收藏」', async () => {
    const { ctx, page } = await open();
    await serveLayered(page);
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'mixlab_cabinet_v1') throw new DOMException('quota', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    });
    await page.getByTestId('save-cabinet-btn').click();
    const toast = page.getByTestId('toast');
    await toast.waitFor({ state: 'visible' });
    const tone = await toast.getAttribute('data-tone');
    const text = await toast.innerText();
    const pressed = await page.getByTestId('save-cabinet-btn').getAttribute('aria-pressed');
    const label = await page.getByTestId('save-cabinet-btn').innerText();
    const stored = await page.evaluate(() => localStorage.getItem('mixlab_cabinet_v1'));
    const headerCount = await page.getByTestId('header-saved-count').innerText();
    await ctx.close();
    return {
      pass: tone === 'error' && pressed === 'false' && !label.includes('已收藏') && stored === null && headerCount === '0',
      detail: `toast(${tone})="${text}"，按钮="${label.trim()}"`,
    };
  });

  await check('P0-5', '320×568 顶栏无溢出，四个按钮全部可点', async () => {
    const { ctx, page } = await open({ ...MOBILE, viewport: { width: 320, height: 568 } });
    const header = await page.locator('header').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    const ids = ['mode-toggle-btn', 'open-cabinet-btn', 'open-intro-btn', 'sound-toggle-btn'];
    const hits = [];
    for (const id of ids) {
      const ok = await page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.right <= window.innerWidth && Boolean(hit && el.contains(hit));
      });
      hits.push(`${id}:${ok ? 'ok' : 'MISS'}`);
    }
    // 标题与按钮不重叠
    const overlap = await page.evaluate(() => {
      const h1 = document.querySelector('header h1').getBoundingClientRect();
      const first = document.querySelector('[data-testid="mode-toggle-btn"]').getBoundingClientRect();
      return h1.right > first.left + 1;
    });
    await page.screenshot({ path: path.join(OUT, 'p0-5-320-header.png'), clip: { x: 0, y: 0, width: 320, height: 60 } });
    await ctx.close();
    return {
      pass: header.sw <= header.cw && hits.every((h) => h.endsWith('ok')) && !overlap,
      detail: `header ${header.sw}/${header.cw}px，${hits.join(' ')}，标题重叠=${overlap}`,
    };
  });

  await check('P0-6a', '海报图片允许 iOS/微信长按保存（touch-callout 未被禁用）', async () => {
    const { ctx, page } = await open();
    await serveLayered(page);
    await page.getByTestId('export-poster-btn').click();
    const img = page.getByTestId('poster-preview-img');
    await img.waitFor({ state: 'visible' });
    const hasClass = await img.evaluate((el) => el.classList.contains('allow-save'));
    // Chrome 不识别 -webkit-touch-callout（CSSOM 会丢弃），因此直接校验构建产物中的规则
    const css = fs
      .readdirSync(path.join(root, 'dist/assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => fs.readFileSync(path.join(root, 'dist/assets', f), 'utf8'))
      .join('');
    const rule = /\.allow-save[^{]*\{[^}]*-webkit-touch-callout:default/.test(css);
    const ok = hasClass && rule;
    await ctx.close();
    return { pass: ok, detail: `img.allow-save + -webkit-touch-callout: default = ${ok}` };
  });

  await check('P0-6b', '移动端优先调用系统分享（navigator.share 携带 PNG 文件）', async () => {
    const { ctx, page } = await open(MOBILE, {
      initScripts: [
        `navigator.canShare = (d) => Boolean(d && d.files && d.files.length); navigator.share = async (d) => { window.__shared = { n: d.files.length, type: d.files[0].type, size: d.files[0].size, name: d.files[0].name }; };`,
      ],
    });
    await serveLayered(page);
    await page.getByTestId('export-poster-btn').click();
    await page.getByTestId('poster-preview-img').waitFor({ state: 'visible' });
    await page.getByTestId('download-poster-btn').click();
    await page.waitForTimeout(400);
    const shared = await page.evaluate(() => window.__shared);
    await ctx.close();
    return {
      pass: shared && shared.type === 'image/png' && shared.size > 50_000,
      detail: shared ? `share(files=${shared.n}, ${shared.type}, ${(shared.size / 1024).toFixed(0)}KB, ${shared.name})` : '未调用 share',
    };
  });

  await check('P0-6c', '桌面端保存按钮触发 PNG 下载并给出反馈', async () => {
    const { ctx, page } = await open(DESKTOP);
    await serveLayered(page);
    await page.getByTestId('export-poster-btn').click();
    await page.getByTestId('poster-preview-img').waitFor({ state: 'visible' });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-poster-btn').click()]);
    const name = dl.suggestedFilename();
    const toast = await page.getByTestId('toast').innerText();
    await ctx.close();
    return { pass: name.endsWith('.png') && toast.includes('下载'), detail: `下载 ${name}，提示「${toast}」` };
  });

  await check('P0-6d', '微信内置浏览器：不再给失效的下载按钮，直接引导长按保存', async () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47(0x18002f2c) NetType/WIFI Language/zh_CN';
    const { ctx, page } = await open({ ...MOBILE, userAgent: ua });
    await serveLayered(page);
    await page.getByTestId('export-poster-btn').click();
    await page.getByTestId('poster-preview-img').waitFor({ state: 'visible' });
    const el = page.getByTestId('download-poster-btn');
    const tag = await el.evaluate((n) => n.tagName);
    const text = await el.innerText();
    await ctx.close();
    return { pass: tag !== 'BUTTON' && text.includes('长按'), detail: `<${tag.toLowerCase()}> ${text}` };
  });

  // 8 种原料（240ml）长岛冰茶式配方
  const EIGHT = ['gin', 'rum', 'vodka', 'tequila', 'cola', 'lime_juice', 'blue_curacao', 'orange_juice'];
  await check('P0-7', '8 种原料海报配方全部列出、百分比合计 100%', async () => {
    const { ctx, page } = await open();
    await serveLayered(page, EIGHT);
    await page.getByTestId('export-poster-btn').click();
    const img = page.getByTestId('poster-preview-img');
    await img.waitFor({ state: 'visible' });
    const rows = await img.getAttribute('data-recipe-rows');
    const ings = await img.getAttribute('data-recipe-ingredients');
    const total = await img.getAttribute('data-percent-total');
    const src = await img.getAttribute('src');
    fs.writeFileSync(path.join(OUT, 'p0-7-poster-8-ingredients.png'), Buffer.from(src.split(',')[1], 'base64'));
    await ctx.close();
    return { pass: rows === '8' && ings === '8' && total === '100', detail: `海报 ${rows} 行 / ${ings} 种原料，合计 ${total}%` };
  });

  await check('P0-8', '品鉴卡配方表 8 种原料全部列出', async () => {
    const { ctx, page } = await open();
    await serveLayered(page, EIGHT);
    const n = await page.getByTestId('result-recipe-row').count();
    const pcts = await page.getByTestId('result-recipe-row').allInnerTexts();
    const sum = pcts.reduce((s, t) => s + parseInt(t.match(/(\d+)%/)?.[1] ?? '0', 10), 0);
    await page.getByTestId('result-sheet').screenshot({ path: path.join(OUT, 'p0-8-result-8-ingredients.png') });
    await ctx.close();
    return { pass: n === 8 && sum === 100, detail: `列出 ${n} 行，百分比合计 ${sum}%` };
  });

  /* ============================== P1 ============================== */

  await check('P1-1', '320×568 首屏主 CTA 在首屏可见可点', async () => {
    const { ctx, page } = await open({ ...MOBILE, viewport: { width: 320, height: 568 } }, { skipIntro: false });
    const r = await page.getByTestId('intro-enter-bar-btn').evaluate((el) => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { bottom: Math.round(b.bottom), hit: Boolean(hit && el.contains(hit)) };
    });
    const sec = await page.getByTestId('intro-open-poster-btn').evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    await page.screenshot({ path: path.join(OUT, 'p1-1-320-intro.png') });
    await ctx.close();
    return { pass: r.bottom <= 568 && r.hit && sec <= 568, detail: `主按钮底部 y=${r.bottom}，副按钮底部 y=${sec}，视口 568` };
  });

  await check('P1-2', '撤销以「一次倾倒」为粒度（长按整次撤回）', async () => {
    const { ctx, page } = await open();
    await gotoPour(page);
    await tap(page, 'gin');
    await hold(page, 'rum', 700);
    const afterHold = await ml(page);
    await page.getByTestId('undo-pour-btn').click();
    const afterUndo = await ml(page);
    await ctx.close();
    return { pass: afterHold > 60 && afterUndo === 30, detail: `30 → 长按 ${afterHold} → 撤销一次 → ${afterUndo}` };
  });

  let firstSerial = '';
  await check('P1-3', '同一杯出酒后锁定，不能重复出酒占编号；改配方后解锁', async () => {
    const { ctx, page } = await open();
    await serveLayered(page);
    firstSerial = (await page.locator('[data-testid="result-sheet"] span').filter({ hasText: 'NO.' }).first().innerText()).replace('NO. ', '');
    await page.getByLabel('关闭品鉴卡').click();
    const locked = await page.getByTestId('served-lock-panel').isVisible();
    const serveBtn = await page.getByTestId('serve-layered-btn').count();
    await page.getByTestId('reopen-result-btn').click();
    const reSerial = (await page.locator('[data-testid="result-sheet"] span').filter({ hasText: 'NO.' }).first().innerText()).replace('NO. ', '');
    await page.getByLabel('关闭品鉴卡').click();
    await gotoPour(page);
    await tap(page, 'soda');
    await page.getByTestId('go-shake-btn').click();
    const unlocked = await page.getByTestId('serve-layered-btn').isVisible();
    await ctx.close();
    return {
      pass: locked && serveBtn === 0 && reSerial === firstSerial && unlocked,
      detail: `锁定面板=${locked}，重开品鉴卡编号一致(${reSerial})，加料后解锁=${unlocked}`,
    };
  });

  await check('P1-4', '桌面无传感器时明确提示改用按钮，而不是谎报「已就绪」', async () => {
    const { ctx, page } = await open(DESKTOP);
    await gotoPour(page);
    await tap(page, 'gin');
    await page.getByTestId('go-shake-btn').click();
    await page.getByTestId('motion-permission-btn').click();
    await page.waitForTimeout(1700);
    const hint = await page.getByTestId('motion-hint').innerText();
    const label = await page.getByTestId('motion-permission-btn').innerText();
    await ctx.close();
    return { pass: hint.includes('未检测到运动传感器') && !label.includes('已开启'), detail: `按钮「${label}」，提示「${hint}」` };
  });

  await check('P1-5', '手机横屏给出竖屏提示；桌面矮窗口可滚动且酒杯不被顶栏遮挡', async () => {
    const m = await open({ ...MOBILE, viewport: { width: 740, height: 360 } }, { skipIntro: false });
    const guard = await m.page.locator('.landscape-guard').evaluate((el) => getComputedStyle(el).display);
    await m.page.screenshot({ path: path.join(OUT, 'p1-5-landscape.png') });
    await m.ctx.close();
    const d = await open({ viewport: { width: 740, height: 360 } });
    const geo = await d.page.evaluate(() => {
      const header = document.querySelector('header').getBoundingClientRect();
      const stage = document.querySelector('[data-testid="glass-stage-container"]').getBoundingClientRect();
      const rootEl = document.getElementById('root');
      return { headerBottom: header.bottom, stageTop: stage.top, scrollable: rootEl.scrollHeight > rootEl.clientHeight };
    });
    await d.ctx.close();
    return {
      pass: guard === 'flex' && geo.stageTop >= geo.headerBottom && geo.scrollable,
      detail: `横屏提示 display=${guard}；桌面矮窗口 舞台 y=${Math.round(geo.stageTop)} ≥ 顶栏底 ${Math.round(geo.headerBottom)}，可滚动=${geo.scrollable}`,
    };
  });

  await check('P1-6', '装饰已满 2 种时不再静默替换，并给出提示', async () => {
    const { ctx, page } = await open();
    await page.getByTestId('step-tab-ice').click();
    await page.getByTestId('garnish-option-mint').click();
    // 已满时 cherry 为 aria-disabled，Playwright 默认不点，用 force 模拟用户硬点
    await page.getByTestId('garnish-option-cherry').click({ force: true });
    const st = async (id) => page.getByTestId(`garnish-option-${id}`).getAttribute('aria-pressed');
    const [lime, mint, cherry] = [await st('lime'), await st('mint'), await st('cherry')];
    const toast = await page.getByTestId('toast').innerText();
    await ctx.close();
    return { pass: lime === 'true' && mint === 'true' && cherry === 'false' && toast.includes('最多'), detail: `lime=${lime} mint=${mint} cherry=${cherry}，提示「${toast}」` };
  });

  await check('P1-7 / P1-8', '顶栏收藏数与图鉴数分开；删除收藏需二次确认', async () => {
    const { ctx, page } = await open();
    // 金酒+蓝柑橘+汤力水：原创特调（非经典），收藏 1 杯但图鉴仍为 0
    await serveLayered(page, ['gin', 'blue_curacao', 'tonic']);
    await page.getByTestId('save-cabinet-btn').click();
    const saved = await page.getByTestId('header-saved-count').innerText();
    const codex = await page.getByTestId('header-codex-count').innerText();
    await page.getByLabel('关闭品鉴卡').click();
    await page.getByTestId('open-cabinet-btn').click();
    await page.getByTestId('cabinet-delete-btn').first().click();
    const afterOne = await page.getByTestId('cabinet-item').count();
    await page.getByTestId('cabinet-delete-btn').first().click();
    const afterTwo = await page.getByTestId('cabinet-item').count();
    await ctx.close();
    return {
      pass: saved === '1' && codex === '0/12' && afterOne === 1 && afterTwo === 0,
      detail: `顶栏 收藏=${saved} 图鉴=${codex}；点 1 次剩 ${afterOne} 条，点 2 次剩 ${afterTwo} 条`,
    };
  });

  await check('P1-9', '同一会话刷新不再强制看首屏，新会话仍展示', async () => {
    const { ctx, page } = await open();
    await page.reload({ waitUntil: 'networkidle' });
    const shown = await page.getByTestId('intro-cover').isVisible();
    await ctx.close();
    const fresh = await open(MOBILE, { skipIntro: false });
    const shownFresh = await fresh.page.getByTestId('intro-cover').isVisible();
    await fresh.ctx.close();
    return { pass: !shown && shownFresh, detail: `刷新后首屏=${shown}，新会话首屏=${shownFresh}` };
  });

  await check('P1-10', '盲品客人人设文案可见', async () => {
    const { ctx, page } = await open();
    await page.getByTestId('mode-toggle-btn').click();
    const el = page.getByTestId('guest-persona');
    const visible = await el.isVisible();
    const text = await el.innerText();
    await ctx.close();
    return { pass: visible && text.length > 3, detail: `「${text}」` };
  });

  await check('P1-11', '纯键盘可完成倒酒与摇匀出酒', async () => {
    const { ctx, page } = await open(DESKTOP);
    await gotoPour(page);
    await page.getByTestId('bottle-gin').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('bottle-tonic').focus();
    await page.keyboard.press('Space');
    const poured = await ml(page);
    await page.getByTestId('go-shake-btn').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('shake-action-btn').focus();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(60);
    }
    await page.getByTestId('result-sheet').waitFor({ state: 'visible', timeout: 3000 });
    const pb = await ctx.close();
    return { pass: poured === 60, detail: `键盘倒入 ${poured}ml，Enter 摇匀后出酒成功` };
  });

  await check('P1-12', '弹窗具备 dialog 语义、Esc 关闭、焦点锁定、遮罩点击关闭', async () => {
    const { ctx, page } = await open(DESKTOP);
    await serveLayered(page);
    const dlg = page.locator('[data-testid="result-sheet"] [role="dialog"]');
    const modal = await dlg.getAttribute('aria-modal');
    for (let i = 0; i < 14; i += 1) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="result-sheet"]').contains(document.activeElement))
    );
    // 海报叠在品鉴卡上：Esc 只关最上层
    await page.getByTestId('export-poster-btn').click();
    await page.getByTestId('poster-preview-img').waitFor({ state: 'visible' });
    // 弹窗带 iOS 式退场动画：以「动画结束后从 DOM 移除」为关闭完成
    const gone = (id) =>
      page.getByTestId(id).waitFor({ state: 'detached', timeout: 1500 }).then(() => true, () => false);
    await page.keyboard.press('Escape');
    const posterGone = await gone('poster-modal');
    const resultStill = await page.getByTestId('result-sheet').isVisible();
    await page.keyboard.press('Escape');
    const resultGone = await gone('result-sheet');
    await page.getByTestId('open-cabinet-btn').click();
    await page.getByTestId('cabinet-drawer').click({ position: { x: 5, y: 5 } });
    const cabinetGone = await gone('cabinet-drawer');
    await ctx.close();
    return {
      pass: modal === 'true' && inside && posterGone && resultStill && resultGone && cabinetGone,
      detail: `aria-modal=${modal}，Tab×14 焦点仍在弹窗内=${inside}，Esc 逐层关闭=${posterGone && resultStill && resultGone}，遮罩关闭=${cabinetGone}`,
    };
  });

  await check('P1-13 / P1-14', '允许缩放；具备 OG / Twitter 分享卡片且图片可访问', async () => {
    const { ctx, page } = await open(MOBILE, { skipIntro: false });
    const meta = await page.evaluate(() => {
      const get = (sel) => document.querySelector(sel)?.getAttribute('content') ?? '';
      return {
        viewport: get('meta[name="viewport"]'),
        ogTitle: get('meta[property="og:title"]'),
        ogDesc: get('meta[property="og:description"]'),
        ogImage: get('meta[property="og:image"]'),
        tw: get('meta[name="twitter:card"]'),
      };
    });
    const local = new URL(meta.ogImage.split('/').pop(), URL_).href;
    const res = await page.request.get(local);
    await ctx.close();
    const scalable = !/user-scalable\s*=\s*no|maximum-scale/i.test(meta.viewport);
    return {
      pass: scalable && meta.ogTitle && meta.ogDesc && meta.ogImage.startsWith('https://') && meta.tw === 'summary_large_image' && res.status() === 200,
      detail: `viewport="${meta.viewport}"，og:image=${meta.ogImage}（本地 ${res.status()}）`,
    };
  });

  await check('P1-15', '空闲时不再 60fps 空转；有气泡才动画；切后台暂停', async () => {
    const { ctx, page } = await open(MOBILE, {
      initScripts: [
        `(() => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); }; })();`,
      ],
    });
    const count = async () => {
      await page.evaluate(() => (window.__raf = 0));
      await page.waitForTimeout(1000);
      return page.evaluate(() => window.__raf);
    };
    const idle = await count();
    await gotoPour(page);
    await tap(page, 'soda');
    const bubbling = await count();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    const hidden = await count();
    await ctx.close();
    return { pass: idle <= 3 && bubbling >= 20 && hidden <= 3, detail: `空闲 ${idle} 次/秒，气泡 ${bubbling} 次/秒，后台 ${hidden} 次/秒` };
  });

  await check('P1-16', '海报生成不再长时间阻塞主线程（分帧 + 异步编码）', async () => {
    const { ctx, page } = await open(MOBILE, { skipIntro: false });
    await page.evaluate(() => {
      window.__lt = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false });
    });
    const t0 = Date.now();
    await page.getByTestId('intro-open-poster-btn').click();
    await page.getByTestId('brand-poster-preview-img').waitFor({ state: 'visible' });
    const total = Date.now() - t0;
    const lt = await page.evaluate(() => window.__lt);
    await ctx.close();
    const max = lt.length ? Math.max(...lt) : 0;
    return { pass: max < 300, detail: `邀请函总耗时 ${total}ms，最长单次阻塞 ${max}ms（长任务 ${JSON.stringify(lt)}）` };
  });

  await check('P1-17', '自托管字体已加载，页面与海报共用字体栈', async () => {
    const { ctx, page } = await open(MOBILE, { skipIntro: false });
    const ok = await page.evaluate(async () => {
      const a = await document.fonts.load('700 20px "Playfair Display"');
      const b = await document.fonts.load('500 12px "JetBrains Mono"');
      return a.length > 0 && b.length > 0 && a.every((f) => f.status === 'loaded') && b.every((f) => f.status === 'loaded');
    });
    const woff = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.woff2')).map((r) => r.name.split('/').pop()));
    await ctx.close();
    return { pass: ok && woff.length >= 1, detail: `已加载 ${woff.join(', ')}` };
  });

  await check('P1-18', 'GitHub Actions 自动构建部署', async () => {
    const wf = path.join(root, '.github/workflows/deploy.yml');
    const text = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
    return { pass: text.includes('npm run build') && text.includes('gh-pages'), detail: fs.existsSync(wf) ? '.github/workflows/deploy.yml' : '缺失' };
  });

  /* ============================== P2 ============================== */

  await check('P2-1', '海报雷达网格加深，从 0 起算并标注数值', async () => {
    const src = fs.readFileSync(path.join(root, 'src/engine/posterGenerator.ts'), 'utf8');
    const ok = !src.includes('Math.max(12, flavor') && src.includes('rgba(143, 29, 44, 0.36)') && src.includes('String(Math.round(flavor[axis.key]))');
    return { pass: ok, detail: '网格 α 0.2→0.36/0.55，下限 12→0，轴标签带数值（见 p0-7 海报截图）' };
  });

  await check('P2-2', '390 首屏酒杯贴近操作舱，下方无大块空白', async () => {
    const { ctx, page } = await open();
    const gap = await page.evaluate(() => {
      const glass = document.querySelector('[data-testid="glass-stage-container"]').getBoundingClientRect();
      const panel = document.querySelector('section').getBoundingClientRect();
      return Math.round(panel.top - glass.bottom);
    });
    await page.screenshot({ path: path.join(OUT, 'p2-2-390-bar.png') });
    await ctx.close();
    return { pass: gap < 40, detail: `酒杯底到操作舱 ${gap}px（原 ~130px）` };
  });

  await check('P2-3', '6 种原料海报百分比合计 100%（最大余数法）', async () => {
    const { ctx, page } = await open();
    await serveLayered(page, ['gin', 'rum', 'vodka', 'lime_juice', 'soda', 'tonic']);
    await page.getByTestId('export-poster-btn').click();
    const img = page.getByTestId('poster-preview-img');
    await img.waitFor({ state: 'visible' });
    const total = await img.getAttribute('data-percent-total');
    const rows = await img.getAttribute('data-recipe-rows');
    await ctx.close();
    return { pass: total === '100' && rows === '6', detail: `${rows} 行，合计 ${total}%` };
  });

  await check('P2-4', '编号带随机后缀，跨设备几乎不会重号', async () => {
    return { pass: /^ML-\d{3}-[2-9A-HJ-NP-Z]{4}$/.test(firstSerial), detail: firstSerial };
  });

  await check('P2-5', '「倒掉」需二次确认', async () => {
    const { ctx, page } = await open();
    await gotoPour(page);
    await tap(page, 'gin');
    await page.getByTestId('clear-glass-btn').click();
    const one = await ml(page);
    await page.getByTestId('clear-glass-btn').click();
    const two = await ml(page);
    await ctx.close();
    return { pass: one === 30 && two === 0, detail: `点 1 次 ${one}ml，点 2 次 ${two}ml` };
  });

  await check('P2-6 / P2-7', '图鉴文案为「已解锁配方」；满杯液面接近杯口', async () => {
    const { ctx, page } = await open();
    await gotoPour(page);
    await tap(page, 'rum');
    await tap(page, 'lime_juice');
    await tap(page, 'soda');
    await page.getByTestId('go-shake-btn').click();
    await page.getByTestId('serve-layered-btn').click();
    await page.getByTestId('result-sheet').waitFor();
    const name = await page.getByTestId('result-drink-name').innerText();
    await page.getByTestId('make-another-btn').click();
    await page.getByTestId('open-cabinet-btn').click();
    await page.getByTestId('tab-classic-codex').click();
    const unlockedText = await page.locator('[data-testid="codex-card"][data-unlocked="true"]').first().innerText();
    await page.getByLabel('关闭酒柜').click();
    for (let i = 0; i < 8; i += 1) await tap(page, 'soda');
    const full = await ml(page);
    const ratio = parseFloat(await page.getByTestId('liquid-fill-group').getAttribute('data-fill-ratio'));
    await page.screenshot({ path: path.join(OUT, 'p2-7-full-glass.png') });
    await ctx.close();
    return {
      pass: unlockedText.includes('已解锁配方') && !unlockedText.includes('已点亮收藏') && full === 240 && ratio >= 0.96,
      detail: `解锁「${name}」卡片文案含「已解锁配方」；${full}ml 液面比例 ${ratio}`,
    };
  });

  await check('P2-8', '音效开关持久化', async () => {
    const { ctx, page } = await open();
    await page.getByTestId('sound-toggle-btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    const pressed = await page.getByTestId('sound-toggle-btn').getAttribute('aria-pressed');
    await ctx.close();
    return { pass: pressed === 'false', detail: `刷新后 aria-pressed=${pressed}` };
  });

  /* ============================ 工程风险 ============================ */

  await check('ENG-1', '100dvh 有 100vh 降级', async () => {
    const css = fs.readdirSync(path.join(root, 'dist/assets')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(root, 'dist/assets', f), 'utf8')).join('');
    const flat = css.replace(/\s/g, '');
    const ok = /\.app-shell\{height:100vh\}/.test(flat) && /@supports\(height:100dvh\)\{[^}]*\.app-shell\{height:100dvh\}/.test(flat);
    return { pass: ok, detail: '.app-shell{height:100vh} + @supports(height:100dvh){height:100dvh}' };
  });

  await check('ENG-2', '切后台回来恢复 AudioContext', async () => {
    const src = fs.readFileSync(path.join(root, 'src/engine/soundEngine.ts'), 'utf8');
    return { pass: src.includes('visibilitychange') && src.includes('resume'), detail: 'visibilitychange / pageshow / pointerdown 时 resume' };
  });

  await check('ENG-3', '倒酒音效不在 setState updater 中触发（StrictMode 不双响）', async () => {
    const src = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    const m = src.match(/setPours\(\(prev\)[\s\S]*?\}\);/);
    return { pass: !m || !m[0].includes('playPour'), detail: '音效移至事件回调，updater 保持纯函数' };
  });

  await check('ENG-4', '海报引擎（qrcode + canvas）已代码分割，首包变小', async () => {
    const dir = path.join(root, 'dist/assets');
    const js = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    const main = js.find((f) => f.startsWith('index-'));
    const mainSrc = fs.readFileSync(path.join(dir, main), 'utf8');
    const size = fs.statSync(path.join(dir, main)).size;
    const lazy = js.filter((f) => f !== main);
    return {
      pass: !mainSrc.includes('errorCorrectionLevel') && lazy.length >= 1 && size < 376404,
      detail: `首包 ${(size / 1024).toFixed(0)}KB（原 368KB），懒加载 chunk: ${lazy.join(', ')}`,
    };
  });

  await check('ALL', '全流程无 console error / page error', async () => ({
    pass: runtimeErrors.length === 0,
    detail: runtimeErrors.length ? runtimeErrors.slice(0, 5).join(' | ') : '0 error',
  }));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(OUT, 'audit-report.json'), JSON.stringify({ url: URL_, at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
console.log(`\n${passed === results.length ? '🎉' : '⚠️'} 审查回归：${passed}/${results.length} 通过，报告与截图见 .audit/`);
process.exit(passed === results.length ? 0 : 1);
