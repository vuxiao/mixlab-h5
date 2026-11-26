/**
 * 生成社交分享卡片 public/og-cover.jpg（1200×630）
 * 用法：npm run build && npx vite preview --port 4173 & ; npm run og-cover
 * 复用应用内真实的「官方邀请函海报」渲染结果，左侧品牌文案 + 右侧海报缩略
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const targetUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const outPath = path.join(projectRoot, 'public', 'og-cover.jpg');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('intro-open-poster-btn').click();
  const img = page.getByTestId('brand-poster-preview-img');
  await img.waitFor({ state: 'visible', timeout: 15000 });
  const posterSrc = await img.getAttribute('src');

  const ogDataUrl = await page.evaluate(async (src) => {
    const poster = new Image();
    poster.src = src;
    await poster.decode();
    await document.fonts.ready;
    const W = 1200;
    const H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1B0E0C');
    bg.addColorStop(1, '#0D0705');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(360, 260, 20, 360, 260, 420);
    glow.addColorStop(0, 'rgba(168,36,54,0.45)');
    glow.addColorStop(1, 'rgba(168,36,54,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(200,155,84,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    const ph = H - 96;
    const pw = (poster.width / poster.height) * ph;
    const px = W - 72 - pw;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.drawImage(poster, px, 48, pw, ph);
    ctx.restore();

    const serif = '"Playfair Display", Georgia, "Songti SC", "Noto Serif SC", serif';
    const sans = '-apple-system, "PingFang SC", "Noto Sans SC", sans-serif';
    const mono = '"JetBrains Mono", Menlo, monospace';
    ctx.fillStyle = '#E5A93C';
    ctx.font = `700 22px ${mono}`;
    ctx.fillText('MIXLAB · SPEAKEASY DIGITAL BAR', 80, 150);
    ctx.fillStyle = '#F5EBD6';
    ctx.font = `700 84px ${serif}`;
    ctx.fillText('微醺研究所', 76, 260);
    ctx.fillStyle = '#D9C7AE';
    ctx.font = `500 30px ${sans}`;
    ctx.fillText('沉浸式线上调酒馆', 80, 320);
    ctx.font = `400 24px ${sans}`;
    ctx.fillStyle = '#B8A690';
    ['选杯 · 加冰 · 倾倒 · 摇匀', '解锁 12 款经典隐藏配方', '生成专属复古特调酒单海报'].forEach((t, i) => {
      ctx.fillText(`✦  ${t}`, 80, 400 + i * 44);
    });
    return c.toDataURL('image/jpeg', 0.86);
  }, posterSrc);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(ogDataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
  console.log(`✅ 已生成 ${path.relative(projectRoot, outPath)} (1200×630)`);
} finally {
  await browser.close();
}
