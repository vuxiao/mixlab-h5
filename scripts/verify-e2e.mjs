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

function decodeCropQr(png, x0, y0, w, h) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const srcIdx = ((y0 + y) * png.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      pixels[dstIdx] = png.data[srcIdx];
      pixels[dstIdx + 1] = png.data[srcIdx + 1];
      pixels[dstIdx + 2] = png.data[srcIdx + 2];
      pixels[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return jsQR(pixels, w, h);
}

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

  // Step 0: 首屏产品介绍页 + 官方邀请函海报校验
  await page.getByTestId('intro-cover').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, '00-intro-cover.png') });
  console.log('✅ Step 0 首屏产品介绍页展示通过');

  await page.getByTestId('intro-open-poster-btn').click();
  const brandImg = page.getByTestId('brand-poster-preview-img');
  await brandImg.waitFor({ state: 'visible', timeout: 8000 });
  const brandSrc = await brandImg.getAttribute('src');
  if (!brandSrc || !brandSrc.startsWith('data:image/png;base64,')) {
    throw new Error('官方产品介绍海报未生成有效 PNG DataURL');
  }
  const brandPng = PNG.sync.read(Buffer.from(brandSrc.replace(/^data:image\/png;base64,/, ''), 'base64'));
  const brandQr = decodeCropQr(brandPng, 700, 1525, 320, 320);
  if (!brandQr || brandQr.data !== expectedPublicUrl) {
    throw new Error(`官方产品介绍海报二维码解析异常: ${brandQr?.data}`);
  }
  console.log(`✅ Step 0.5 官方产品介绍海报 (${brandPng.width}x${brandPng.height}) 及二维码校验通过`);
  await page.getByLabel('关闭官方邀请海报').click();

  // 进入调酒台
  await page.getByTestId('intro-enter-bar-btn').click();
  await page.getByTestId('intro-cover').waitFor({ state: 'hidden', timeout: 3000 });

  // Step 1: 切换古典杯 -> 选「02 冰与饰」校验文案完整性与「匠人大冰球」包围盒位于杯腔内部！
  await page.getByTestId('glass-option-rocks').click();
  await page.getByTestId('step-tab-ice').click();

  const descNone = await page.getByTestId('ice-desc-none').innerText();
  const descCubes = await page.getByTestId('ice-desc-cubes').innerText();
  const descSphere = await page.getByTestId('ice-desc-sphere').innerText();
  if (!descNone.includes('原汁纯饮') || !descCubes.includes('急速降温') || !descSphere.includes('慢融锁冷')) {
    throw new Error(`冰块描述文案异常或遭截断: ${descNone} | ${descCubes} | ${descSphere}`);
  }
  console.log(`✅ Step 1 冰块描述完整无腰斩: "${descNone}" / "${descCubes}" / "${descSphere}"`);

  await page.getByTestId('ice-option-sphere').click();
  await page.waitForTimeout(420);

  const stageBox = await page.getByTestId('glass-stage-container').boundingBox();
  const sphereBox = await page.getByTestId('ice-sphere-circle').boundingBox();
  if (!stageBox || !sphereBox) {
    throw new Error('未找到酒杯舞台或大冰球 SVG 元素');
  }
  const sphereCenterX = sphereBox.x + sphereBox.width / 2;
  const sphereCenterY = sphereBox.y + sphereBox.height / 2;
  const stageCenterX = stageBox.x + stageBox.width / 2;
  const xDelta = Math.abs(sphereCenterX - stageCenterX);
  const insideVertical = sphereCenterY > stageBox.y + stageBox.height * 0.45 && sphereCenterY < stageBox.y + stageBox.height * 0.9;
  if (xDelta > 16 || !insideVertical || sphereBox.width < 32) {
    throw new Error(
      `大冰球定位异常! stageBox=${JSON.stringify(stageBox)}, sphereBox=${JSON.stringify(sphereBox)}, xDelta=${xDelta}`
    );
  }
  console.log(
    `✅ Step 2 「匠人大冰球」真机包围盒校验通过: 中心(${sphereCenterX.toFixed(1)}, ${sphereCenterY.toFixed(1)}) 位于杯腔正中 (直径 ${sphereBox.width.toFixed(1)}px)`
  );
  await page.screenshot({ path: path.join(screenshotDir, '01-rocks-ice-sphere.png') });

  // 辅助倒酒函数
  const pourBottle = async (id) => {
    const btn = page.getByTestId(`bottle-${id}`);
    await btn.scrollIntoViewIfNeeded();
    await btn.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
    await page.waitForTimeout(40);
    await btn.dispatchEvent('pointerup', { pointerId: 1, bubbles: true });
    await page.waitForTimeout(200);
  };

  // Step 3: 回归测试经典配方防误判：金酒 30 + 蓝柑橘 30 + 汤力水 30 不应误判为「金汤力」
  await page.getByTestId('step-tab-pour').click();
  await pourBottle('gin');
  await pourBottle('blue_curacao');
  await pourBottle('tonic');
  await page.screenshot({ path: path.join(screenshotDir, '02-blue-layered-pour.png') });

  await page.getByTestId('go-shake-btn').click();
  await page.getByTestId('serve-layered-btn').click();
  await page.getByTestId('result-sheet').waitFor({ state: 'visible', timeout: 5000 });
  const blueDrinkName = await page.getByTestId('result-drink-name').innerText();
  const isMisjudgedClassic = await page.getByTestId('classic-unlocked-badge').isVisible();
  if (isMisjudgedClassic || blueDrinkName.includes('金汤力')) {
    throw new Error(`经典配方误判 Bug 未修复! 金酒+蓝柑橘+汤力水竟被判定为: ${blueDrinkName}`);
  }
  console.log(`✅ Step 3 经典配方防误判回归通过: 金酒+蓝柑橘+汤力水判定为原创蓝色特调「${blueDrinkName}」`);

  // 调制下一杯：验证经典莫吉托解锁 + 摇匀 + 品鉴卡缩略预览杯 + 海报 + 收藏持久化
  await page.getByText('调制下一杯特调').click();
  await page.getByTestId('step-tab-glass').click();
  await page.getByTestId('glass-option-highball').click();
  await page.getByTestId('step-tab-ice').click();
  await page.getByTestId('ice-option-cubes').click();
  await page.getByTestId('garnish-option-mint').click();
  await page.getByTestId('step-tab-pour').click();

  const getFillRatio = async () =>
    parseFloat((await page.getByTestId('liquid-fill-group').getAttribute('data-fill-ratio')) || '0');
  const r0 = await getFillRatio();
  await pourBottle('rum');
  const r1 = await getFillRatio();
  await pourBottle('lime_juice');
  const r2 = await getFillRatio();
  await pourBottle('soda');
  const r3 = await getFillRatio();
  if (!(r0 < r1 && r1 < r2 && r2 < r3)) {
    throw new Error(`液面高度未按预期递增: ${r0} -> ${r1} -> ${r2} -> ${r3}`);
  }

  await page.getByTestId('go-shake-btn').click();
  const shakeBtn = page.getByTestId('shake-action-btn');
  await shakeBtn.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
  await page.waitForTimeout(1250);
  await shakeBtn.dispatchEvent('pointerup', { pointerId: 1, bubbles: true });

  await page.getByTestId('result-sheet').waitFor({ state: 'visible', timeout: 5000 });
  const mojitoName = await page.getByTestId('result-drink-name').innerText();
  const classicVisible = await page.getByTestId('classic-unlocked-badge').isVisible();
  const miniGlassVisible = await page.getByTestId('result-mini-glass').isVisible();
  if (!classicVisible || !mojitoName.includes('莫吉托') || !miniGlassVisible) {
    throw new Error(
      `莫吉托品鉴卡验收异常: name=${mojitoName}, classic=${classicVisible}, miniGlass=${miniGlassVisible}`
    );
  }
  console.log(`✅ Step 4 摇匀解锁「${mojitoName}」且品鉴卡成品缩略预览杯渲染正常`);
  await page.screenshot({ path: path.join(screenshotDir, '03-result-sheet-with-preview.png') });

  // 导出酒单海报并校验内嵌二维码
  await page.getByTestId('export-poster-btn').click();
  const posterImg = page.getByTestId('poster-preview-img');
  await posterImg.waitFor({ state: 'visible', timeout: 8000 });
  const posterDataUrl = await posterImg.getAttribute('src');
  const posterPng = PNG.sync.read(
    Buffer.from(posterDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
  );
  const posterQr = decodeCropQr(posterPng, 520, 1100, 180, 180);
  if (!posterQr || posterQr.data !== expectedPublicUrl) {
    throw new Error(`专属酒单海报二维码解码异常: ${posterQr?.data}`);
  }
  console.log(`✅ Step 5 专属酒单海报 (${posterPng.width}x${posterPng.height}) 及二维码校验通过`);

  // 收藏进酒柜 -> 刷新页面 -> 校验持久化与随时重开介绍页
  await page.getByLabel('关闭海报预览').click();
  await page.getByTestId('save-cabinet-btn').click();
  await page.waitForTimeout(200);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('intro-enter-bar-btn').click();
  await page.getByTestId('open-cabinet-btn').click();
  await page.getByTestId('cabinet-drawer').waitFor({ state: 'visible' });
  const savedCount = await page.getByTestId('cabinet-item').count();
  if (savedCount < 1) {
    throw new Error('刷新后酒柜收藏丢失！');
  }
  await page.getByLabel('关闭酒柜').click();

  // 顶栏 Info 按钮重新唤出产品介绍页
  await page.getByTestId('open-intro-btn').click();
  await page.getByTestId('intro-cover').waitFor({ state: 'visible', timeout: 3000 });
  console.log('✅ Step 6 收藏刷新持久化与顶栏重开介绍页验收全部通过');

  if (consoleErrors.length > 0 || pageErrors.length > 0 || failedRequests.length > 0) {
    throw new Error(
      `检测到运行时错误:\nconsoleErrors=${JSON.stringify(consoleErrors)}\npageErrors=${JSON.stringify(pageErrors)}\nfailedRequests=${JSON.stringify(failedRequests)}`
    );
  }

  console.log('🎉 精修版全流程 E2E 验收全部通过，零 Console Error，零失败请求！');
} finally {
  await browser.close();
}
