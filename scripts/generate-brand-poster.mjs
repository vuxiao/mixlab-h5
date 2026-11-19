import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const outPath = path.join(projectRoot, 'product-intro-qr.png');
const expectedUrl = process.argv[2] || 'https://vuxiao.github.io/mixlab-h5/';

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('❌ 请先执行 npm run build 生成 dist/ 目录');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = path.join(distDir, rel);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const localUrl = `http://127.0.0.1:${port}/`;

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(localUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('intro-open-poster-btn').click();
  const img = page.getByTestId('brand-poster-preview-img');
  await img.waitFor({ state: 'visible', timeout: 10000 });
  const dataUrl = await img.getAttribute('src');
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('未能获取到官方邀请函海报 PNG DataURL');
  }

  const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(outPath, buf);

  // 真扫码解码验证（同时裁剪底部二维码区域和全图检查）
  const png = PNG.sync.read(buf);
  const qrX = 700;
  const qrY = 1525;
  const qrW = 320;
  const qrH = 320;
  const crop = new Uint8ClampedArray(qrW * qrH * 4);
  for (let y = 0; y < qrH; y += 1) {
    for (let x = 0; x < qrW; x += 1) {
      const srcIdx = ((qrY + y) * png.width + (qrX + x)) * 4;
      const dstIdx = (y * qrW + x) * 4;
      crop[dstIdx] = png.data[srcIdx];
      crop[dstIdx + 1] = png.data[srcIdx + 1];
      crop[dstIdx + 2] = png.data[srcIdx + 2];
      crop[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  const decoded = jsQR(crop, qrW, qrH) || jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!decoded || decoded.data !== expectedUrl) {
    throw new Error(`product-intro-qr.png 二维码解码失败: ${decoded?.data}`);
  }

  console.log(`✅ 官方产品介绍二维码海报已生成并通过真扫码校验: ${outPath}`);
  console.log(`   分辨率: ${png.width}x${png.height} (${(buf.length / 1024).toFixed(1)} KB)`);
  console.log(`   扫码解析结果: ${decoded.data}`);
} finally {
  await browser.close();
  server.close();
}
