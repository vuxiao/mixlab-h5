import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const targetUrl = process.argv[2] || 'https://vuxiao.github.io/mixlab-h5/';
const outPath = path.join(projectRoot, 'qrcode.png');

await QRCode.toFile(outPath, targetUrl, {
  type: 'png',
  width: 600,
  margin: 4,
  errorCorrectionLevel: 'H',
  color: {
    dark: '#1A110D',
    light: '#F5EBD6',
  },
});

const buffer = fs.readFileSync(outPath);
const png = PNG.sync.read(buffer);
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

if (!decoded || decoded.data !== targetUrl) {
  console.error('❌ 二维码校验失败:', decoded?.data);
  process.exit(1);
}

console.log(`✅ 二维码已生成并解码校验通过: ${outPath}`);
console.log(`   分辨率: ${png.width}x${png.height}`);
console.log(`   扫码解析结果: ${decoded.data}`);
