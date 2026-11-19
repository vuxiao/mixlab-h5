import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const targetUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const expectedPublicUrl = 'https://vuxiao.github.io/mixlab-h5/';
const screenshotDir = process.argv[3] || path.join(projectRoot, '.verify-shots');
fs.mkdirSync(screenshotDir, { recursive: true });

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  console.log(`🚀 打开目标地址: ${targetUrl}`);
  const mainResp = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  if (!mainResp || mainResp.status() !== 200) {
    throw new Error(`主页面 HTTP 状态异常: ${mainResp?.status()}`);
  }

  // 检查无横向滚动条
  const overflowInfo = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (overflowInfo.scrollWidth > overflowInfo.innerWidth) {
    throw new Error(
      `检测到横向溢出: scrollWidth=${overflowInfo.scrollWidth} > innerWidth=${overflowInfo.innerWidth}`
    );
  }
  console.log(`✅ 视口宽度校验通过 (${overflowInfo.innerWidth}px，无横向滚动条)`);

  // Step 1: 选杯型（马天尼 -> 古典 -> 高球）
  await page.getByTestId('glass-option-martini').click();
  await page.waitForTimeout(150);
  await page.getByTestId('glass-option-rocks').click();
  await page.waitForTimeout(150);
  await page.getByTestId('glass-option-highball').click();
  await page.waitForTimeout(150);
  console.log('✅ Step 1 选杯型切换验证通过');

  // Step 2: 加冰与装饰
  await page.getByTestId('step-tab-ice').click();
  await page.getByTestId('ice-option-cubes').click();
  await page.getByTestId('garnish-option-mint').click();
  console.log('✅ Step 2 加冰与装饰验证通过');

  // Step 3: 倒酒（倒入 3 种莫吉托核心原料：白朗姆 + 青柠汁 + 苏打水）
  await page.getByTestId('step-tab-pour').click();
  const getFillRatio = async () =>
    parseFloat((await page.getByTestId('liquid-fill-group').getAttribute('data-fill-ratio')) || '0');

  const r0 = await getFillRatio();
  // 短点（PointerDown -> PointerUp < 180ms）倒入 30ml
  const pourBottle = async (id) => {
    const btn = page.getByTestId(`bottle-${id}`);
    await btn.scrollIntoViewIfNeeded();
    await btn.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
    await page.waitForTimeout(40);
    await btn.dispatchEvent('pointerup', { pointerId: 1, bubbles: true });
    await page.waitForTimeout(220);
  };

  await pourBottle('rum');
  const r1 = await getFillRatio();
  await pourBottle('lime_juice');
  const r2 = await getFillRatio();
  await pourBottle('soda');
  const r3 = await getFillRatio();

  const liveMl = await page.getByTestId('live-ml').innerText();
  const liveAbv = await page.getByTestId('live-abv').innerText();

  if (!(r0 < r1 && r1 < r2 && r2 < r3)) {
    throw new Error(`液面高度未按预期递增: ${r0} -> ${r1} -> ${r2} -> ${r3}`);
  }
  console.log(`✅ Step 3 倒酒液面验证通过: 液面比例 ${r0} -> ${r1} -> ${r2} -> ${r3} | 容量 ${liveMl} | ABV ${liveAbv}`);

  await page.screenshot({ path: path.join(screenshotDir, '01-bar-poured.png') });

  // Step 4: 摇匀出酒（连点/长按兜底按钮推进至 100%）
  await page.getByTestId('go-shake-btn').click();
  const shakeBtn = page.getByTestId('shake-action-btn');
  await shakeBtn.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
  await page.waitForTimeout(1250);
  await shakeBtn.dispatchEvent('pointerup', { pointerId: 1, bubbles: true });

  await page.getByTestId('result-sheet').waitFor({ state: 'visible', timeout: 5000 });
  const drinkName = await page.getByTestId('result-drink-name').innerText();
  const resultAbv = await page.getByTestId('result-abv').innerText();
  const classicBadgeVisible = await page.getByTestId('classic-unlocked-badge').isVisible();
  const radarCount = await page.locator('[aria-label="五维风味雷达图"]').count();

  if (!classicBadgeVisible || !drinkName.includes('莫吉托')) {
    throw new Error(`经典隐藏配方判定异常: drinkName=${drinkName}, classicBadge=${classicBadgeVisible}`);
  }
  if (radarCount < 1) {
    throw new Error('未找到五维风味雷达图 SVG');
  }
  console.log(`✅ Step 4 摇匀出酒 & 经典配方解锁通过: ${drinkName} (${resultAbv}) | 雷达图正常渲染`);

  await page.screenshot({ path: path.join(screenshotDir, '02-result-sheet.png') });

  // Step 5: 导出特调海报并解码验证海报内嵌的公网二维码
  await page.getByTestId('export-poster-btn').click();
  const posterImg = page.getByTestId('poster-preview-img');
  await posterImg.waitFor({ state: 'visible', timeout: 8000 });
  const posterDataUrl = await posterImg.getAttribute('src');
  if (!posterDataUrl || !posterDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('海报未生成有效 PNG DataURL');
  }

  const posterBase64 = posterDataUrl.replace(/^data:image\/png;base64,/, '');
  const posterPng = PNG.sync.read(Buffer.from(posterBase64, 'base64'));
  if (posterPng.width !== 750 || posterPng.height !== 1334) {
    throw new Error(`海报尺寸异常: ${posterPng.width}x${posterPng.height}`);
  }

  // 裁剪海报右下角二维码区域进行真扫码解析验证
  const qrX = 520;
  const qrY = 1100;
  const qrW = 180;
  const qrH = 180;
  const qrPixels = new Uint8ClampedArray(qrW * qrH * 4);
  for (let y = 0; y < qrH; y += 1) {
    for (let x = 0; x < qrW; x += 1) {
      const srcIdx = ((qrY + y) * posterPng.width + (qrX + x)) * 4;
      const dstIdx = (y * qrW + x) * 4;
      qrPixels[dstIdx] = posterPng.data[srcIdx];
      qrPixels[dstIdx + 1] = posterPng.data[srcIdx + 1];
      qrPixels[dstIdx + 2] = posterPng.data[srcIdx + 2];
      qrPixels[dstIdx + 3] = posterPng.data[srcIdx + 3];
    }
  }
  const posterQr = jsQR(qrPixels, qrW, qrH);
  if (!posterQr || posterQr.data !== expectedPublicUrl) {
    throw new Error(`海报内嵌二维码解码异常: ${posterQr?.data}`);
  }
  console.log(`✅ Step 5 高清海报生成通过 (750x1334) 且内嵌二维码真扫码解析一致: ${posterQr.data}`);

  await page.screenshot({ path: path.join(screenshotDir, '03-poster-modal.png') });

  // 关闭海报 -> 收藏进酒柜 -> 刷新页面 -> 验证持久化不丢失
  await page.getByLabel('关闭海报预览').click();
  await page.getByTestId('save-cabinet-btn').click();
  await page.waitForTimeout(200);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('open-cabinet-btn').click();
  await page.getByTestId('cabinet-drawer').waitFor({ state: 'visible' });
  const savedItems = await page.getByTestId('cabinet-item').count();
  if (savedItems < 1) {
    throw new Error('刷新后酒柜收藏丢失！');
  }
  const cabinetText = await page.getByTestId('cabinet-drawer').innerText();
  if (!cabinetText.includes('莫吉托') || !cabinetText.includes('1/12')) {
    throw new Error(`酒柜持久化内容异常: ${cabinetText}`);
  }
  console.log(`✅ Step 6 收藏进酒柜并刷新持久化验收通过 (已存 ${savedItems} 杯, 经典图鉴 1/12)`);

  await page.screenshot({ path: path.join(screenshotDir, '04-cabinet-drawer.png') });

  // 额外验收：切换微醺挑战盲品模式
  await page.getByLabel('关闭酒柜').click();
  await page.getByTestId('mode-toggle-btn').click();
  await page.getByTestId('challenge-banner').waitFor({ state: 'visible' });
  console.log('✅ Step 7 「微醺挑战」盲品订单模式切换验收通过');
  await page.screenshot({ path: path.join(screenshotDir, '05-challenge-mode.png') });

  if (consoleErrors.length > 0 || pageErrors.length > 0 || failedRequests.length > 0) {
    throw new Error(
      `检测到运行时错误:\nconsoleErrors=${JSON.stringify(consoleErrors)}\npageErrors=${JSON.stringify(pageErrors)}\nfailedRequests=${JSON.stringify(failedRequests)}`
    );
  }

  console.log('🎉 全流程无头浏览器 E2E 验收全部通过，零 Console Error，零失败请求！');
} finally {
  await browser.close();
}
