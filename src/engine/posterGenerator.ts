import QRCode from 'qrcode';
import { APP_CONFIG } from '../config';
import { GLASS_MAP } from '../data/glasses';
import { DrinkEvaluation, FlavorProfile, GlassId, IceType } from '../types';
import { computeLiquidLayers, mixHexColors } from './flavorEngine';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapChineseText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  let line = '';
  let currY = y;
  let linesDrawn = 0;

  for (let i = 0; i < text.length; i += 1) {
    const testLine = line + text[i];
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      linesDrawn += 1;
      if (linesDrawn >= maxLines) {
        ctx.fillText(line.slice(0, -1) + '…', x, currY);
        return currY + lineHeight;
      }
      ctx.fillText(line, x, currY);
      line = text[i];
      currY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currY);
    currY += lineHeight;
  }
  return currY;
}

function drawCocktailIllustration(
  ctx: CanvasRenderingContext2D,
  drink: DrinkEvaluation,
  cx: number,
  cy: number
) {
  const layers = computeLiquidLayers(drink.pours);
  const fillRatio = Math.min(0.92, Math.max(0.22, drink.totalMl / APP_CONFIG.maxGlassMl));

  // 背景微光晕染
  const aura = ctx.createRadialGradient(cx, cy - 10, 12, cx, cy - 10, 165);
  aura.addColorStop(0, `${drink.blendedColor}55`);
  aura.addColorStop(0.6, `${drink.blendedColor}18`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy - 10, 165, 0, Math.PI * 2);
  ctx.fill();

  // 定义杯腔几何路径
  const buildCavityPath = (glassId: GlassId) => {
    ctx.beginPath();
    if (glassId === 'martini') {
      ctx.moveTo(cx - 98, cy - 110);
      ctx.lineTo(cx + 98, cy - 110);
      ctx.lineTo(cx + 5, cy + 8);
      ctx.lineTo(cx - 5, cy + 8);
      ctx.closePath();
      return { topY: cy - 110, bottomY: cy + 8, width: 196 };
    }
    if (glassId === 'rocks') {
      ctx.moveTo(cx - 78, cy - 72);
      ctx.lineTo(cx + 78, cy - 72);
      ctx.lineTo(cx + 68, cy + 92);
      ctx.lineTo(cx - 68, cy + 92);
      ctx.closePath();
      return { topY: cy - 72, bottomY: cy + 92, width: 156 };
    }
    // highball
    ctx.moveTo(cx - 56, cy - 122);
    ctx.lineTo(cx + 56, cy - 122);
    ctx.lineTo(cx + 48, cy + 104);
    ctx.lineTo(cx - 48, cy + 104);
    ctx.closePath();
    return { topY: cy - 122, bottomY: cy + 104, width: 112 };
  };

  // 先绘装饰物（后置层：薄荷、迷迭香、柠檬片）
  const rimY = drink.glassId === 'martini' ? cy - 110 : drink.glassId === 'rocks' ? cy - 72 : cy - 122;
  const rimRightX = drink.glassId === 'martini' ? cx + 82 : drink.glassId === 'rocks' ? cx + 68 : cx + 50;

  if (drink.garnishes.includes('lime')) {
    ctx.save();
    ctx.translate(rimRightX, rimY + 2);
    ctx.fillStyle = '#5CA935';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#D9F58C';
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7DC444';
    ctx.lineWidth = 2;
    for (let a = 0; a < 6; a += 1) {
      const ang = (a * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * 19, Math.sin(ang) * 19);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (drink.garnishes.includes('mint')) {
    ctx.save();
    ctx.translate(cx - 26, rimY - 4);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#3E9B5E';
    ctx.beginPath();
    ctx.ellipse(-10, -8, 16, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57B876';
    ctx.beginPath();
    ctx.ellipse(8, -14, 15, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (drink.garnishes.includes('rosemary')) {
    ctx.save();
    ctx.translate(cx + 20, rimY + 12);
    ctx.rotate(0.28);
    ctx.strokeStyle = '#5C8955';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.lineTo(0, -48);
    ctx.stroke();
    for (let y = -40; y <= 14; y += 11) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(-10, y - 6);
      ctx.moveTo(0, y);
      ctx.lineTo(10, y - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 裁剪并绘制液体、冰块与气泡
  ctx.save();
  const bounds = buildCavityPath(drink.glassId);
  ctx.clip();

  const liquidHeight = (bounds.bottomY - bounds.topY) * fillRatio;
  const liquidTopY = bounds.bottomY - liquidHeight;

  const grad = ctx.createLinearGradient(cx, bounds.bottomY, cx, liquidTopY);
  if (drink.shaken || layers.length <= 1) {
    const deep = mixHexColors(drink.blendedColor, '#120B08', 0.22);
    const bright = mixHexColors(drink.blendedColor, '#FFF8E7', 0.24);
    grad.addColorStop(0, deep);
    grad.addColorStop(0.55, drink.blendedColor);
    grad.addColorStop(1, bright);
  } else {
    let acc = 0;
    layers.forEach((layer, idx) => {
      const mid = Math.max(0, Math.min(1, acc + layer.ratio * 0.5));
      if (idx === 0) grad.addColorStop(0, layer.color);
      grad.addColorStop(mid, layer.color);
      acc += layer.ratio;
      if (idx === layers.length - 1) grad.addColorStop(1, layer.color);
    });
  }

  ctx.fillStyle = grad;
  ctx.fillRect(cx - 120, liquidTopY, 240, liquidHeight + 10);

  // 液面高光椭圆
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, liquidTopY + 1, bounds.width * 0.45, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 冰块
  drawPosterIce(ctx, drink.iceType, cx, liquidTopY, bounds.bottomY);

  // 碳酸气泡
  if (drink.hasBubbles) {
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    for (let i = 0; i < 24; i += 1) {
      const bx = cx - bounds.width * 0.32 + ((i * 37) % Math.round(bounds.width * 0.64));
      const by = liquidTopY + 12 + ((i * 53) % Math.max(20, Math.round(liquidHeight - 16)));
      const br = 1.6 + (i % 3) * 1.1;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // 前置装饰：樱桃 & 橙皮卷
  if (drink.garnishes.includes('cherry')) {
    ctx.save();
    ctx.strokeStyle = '#C89B54';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 32, rimY - 22);
    ctx.lineTo(cx + 12, rimY + 26);
    ctx.stroke();
    ctx.fillStyle = '#B8132B';
    ctx.beginPath();
    ctx.arc(cx - 6, rimY + 6, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx - 9, rimY + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (drink.garnishes.includes('orange_peel')) {
    ctx.save();
    ctx.strokeStyle = '#F28F22';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 54, rimY + 4);
    ctx.bezierCurveTo(cx - 62, rimY - 22, cx - 28, rimY - 26, cx - 22, rimY - 4);
    ctx.stroke();
    ctx.restore();
  }

  // 绘制玻璃杯轮廓、杯脚与水晶高光
  ctx.save();
  ctx.strokeStyle = 'rgba(245, 235, 214, 0.72)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';

  if (drink.glassId === 'martini') {
    ctx.beginPath();
    ctx.moveTo(cx - 102, cy - 112);
    ctx.lineTo(cx - 4, cy + 10);
    ctx.lineTo(cx - 4, cy + 112);
    ctx.moveTo(cx + 102, cy - 112);
    ctx.lineTo(cx + 4, cy + 10);
    ctx.lineTo(cx + 4, cy + 112);
    ctx.stroke();

    // 底座
    ctx.beginPath();
    ctx.ellipse(cx, cy + 116, 48, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,235,214,0.12)';
    ctx.fill();

    // 杯口椭圆
    ctx.beginPath();
    ctx.ellipse(cx, cy - 112, 102, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (drink.glassId === 'rocks') {
    ctx.beginPath();
    ctx.moveTo(cx - 82, cy - 76);
    ctx.lineTo(cx - 70, cy + 112);
    ctx.lineTo(cx + 70, cy + 112);
    ctx.lineTo(cx + 82, cy - 76);
    ctx.stroke();

    // 厚重水晶杯底
    ctx.fillStyle = 'rgba(245, 235, 214, 0.14)';
    ctx.fillRect(cx - 69, cy + 92, 138, 19);

    ctx.beginPath();
    ctx.ellipse(cx, cy - 76, 82, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 59, cy - 126);
    ctx.lineTo(cx - 50, cy + 118);
    ctx.lineTo(cx + 50, cy + 118);
    ctx.lineTo(cx + 59, cy - 126);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245, 235, 214, 0.14)';
    ctx.fillRect(cx - 49, cy + 102, 98, 15);

    ctx.beginPath();
    ctx.ellipse(cx, cy - 126, 59, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 左侧水晶反光条
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (drink.glassId === 'martini') {
    ctx.moveTo(cx - 78, cy - 92);
    ctx.lineTo(cx - 26, cy - 26);
  } else if (drink.glassId === 'rocks') {
    ctx.moveTo(cx - 66, cy - 52);
    ctx.lineTo(cx - 58, cy + 72);
  } else {
    ctx.moveTo(cx - 44, cy - 98);
    ctx.lineTo(cx - 38, cy + 78);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPosterIce(
  ctx: CanvasRenderingContext2D,
  iceType: IceType,
  cx: number,
  liquidTopY: number,
  bottomY: number
) {
  if (iceType === 'none') return;
  ctx.save();
  if (iceType === 'sphere') {
    const r = 34;
    const iy = Math.min(bottomY - r - 6, Math.max(liquidTopY + r - 8, (liquidTopY + bottomY) / 2));
    const g = ctx.createRadialGradient(cx - 11, iy - 11, 3, cx, iy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.38, 'rgba(224,245,255,0.46)');
    g.addColorStop(0.76, 'rgba(170,218,245,0.24)');
    g.addColorStop(1, 'rgba(255,255,255,0.68)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, iy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,251,255,0.88)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 手凿弧形镜面高光与微冰裂
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, iy, r * 0.68, Math.PI * 1.12, Math.PI * 1.48);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - 11, iy + 4);
    ctx.lineTo(cx - 1, iy - 4);
    ctx.lineTo(cx + 12, iy + 2);
    ctx.stroke();
  } else {
    const cubes = [
      { dx: -18, dy: 18, rot: -0.22, size: 28 },
      { dx: 18, dy: 34, rot: 0.25, size: 26 },
      { dx: -4, dy: 58, rot: -0.1, size: 28 },
    ];
    cubes.forEach((cube) => {
      const cyPos = Math.min(bottomY - 18, liquidTopY + cube.dy);
      ctx.save();
      ctx.translate(cx + cube.dx, cyPos);
      ctx.rotate(cube.rot);
      ctx.fillStyle = 'rgba(235, 248, 255, 0.28)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.56)';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, -cube.size / 2, -cube.size / 2, cube.size, cube.size, 5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }
  ctx.restore();
}

function drawPosterRadar(
  ctx: CanvasRenderingContext2D,
  flavor: FlavorProfile,
  cx: number,
  cy: number,
  radius: number
) {
  const axes: Array<{ key: keyof FlavorProfile; label: string }> = [
    { key: 'sour', label: '酸' },
    { key: 'sweet', label: '甜' },
    { key: 'bitter', label: '苦' },
    { key: 'strong', label: '烈' },
    { key: 'refreshing', label: '爽' },
  ];

  // 同心五边形网格
  [0.33, 0.66, 1].forEach((scale) => {
    ctx.beginPath();
    axes.forEach((_, idx) => {
      const ang = -Math.PI / 2 + (idx * Math.PI * 2) / 5;
      const px = cx + Math.cos(ang) * radius * scale;
      const py = cy + Math.sin(ang) * radius * scale;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(143, 29, 44, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // 轴线与标签
  ctx.font = '600 18px "PingFang SC", sans-serif';
  ctx.fillStyle = '#3B251B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  axes.forEach((axis, idx) => {
    const ang = -Math.PI / 2 + (idx * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
    ctx.strokeStyle = 'rgba(143, 29, 44, 0.16)';
    ctx.stroke();

    const lx = cx + Math.cos(ang) * (radius + 22);
    const ly = cy + Math.sin(ang) * (radius + 20);
    ctx.fillText(axis.label, lx, ly);
  });

  // 数据多边形
  ctx.beginPath();
  axes.forEach((axis, idx) => {
    const val = Math.max(12, flavor[axis.key]) / 100;
    const ang = -Math.PI / 2 + (idx * Math.PI * 2) / 5;
    const px = cx + Math.cos(ang) * radius * val;
    const py = cy + Math.sin(ang) * radius * val;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(143, 29, 44, 0.26)';
  ctx.fill();
  ctx.strokeStyle = '#8F1D2C';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

export async function generateCocktailPosterDataUrl(
  drink: DrinkEvaluation,
  challengeStars?: number
): Promise<string> {
  const W = 750;
  const H = 1334;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // 1. 复古奶油纸底
  ctx.fillStyle = '#F4E9D4';
  ctx.fillRect(0, 0, W, H);

  // 极轻微纸张颗粒噪点
  ctx.fillStyle = 'rgba(92, 62, 42, 0.035)';
  for (let i = 0; i < 420; i += 1) {
    const gx = (i * 97) % W;
    const gy = (i * 173) % H;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // 2. 杂志外框与内铜线
  ctx.strokeStyle = '#2B1912';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(33, 33, W - 66, H - 66);

  // 3. 顶部杂志刊头
  ctx.fillStyle = '#1B110D';
  ctx.fillRect(46, 46, W - 92, 74);

  ctx.fillStyle = '#F5EBD6';
  ctx.font = '700 28px Georgia, "Songti SC", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('MIXLAB · 微醺研究所', 68, 83);

  ctx.fillStyle = '#E5A93C';
  ctx.font = '600 18px Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`NO. ${drink.serialNo}`, W - 68, 76);

  const dateStr = new Date(drink.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  ctx.fillStyle = '#C7B69C';
  ctx.font = '500 13px Menlo, monospace';
  ctx.fillText(dateStr, W - 68, 100);

  // 4. 中央暗夜吧台酒杯画框
  const stageX = 46;
  const stageY = 136;
  const stageW = W - 92;
  const stageH = 408;

  const stageGrad = ctx.createLinearGradient(stageX, stageY, stageX, stageY + stageH);
  stageGrad.addColorStop(0, '#1B110D');
  stageGrad.addColorStop(1, '#0F0907');
  ctx.fillStyle = stageGrad;
  drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 10);
  ctx.fill();
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 画框四角微文字
  ctx.fillStyle = 'rgba(229, 169, 60, 0.72)';
  ctx.font = '600 14px Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${GLASS_MAP[drink.glassId]?.enName.toUpperCase() ?? 'GLASS'} · ${drink.totalMl}ML`,
    stageX + 20,
    stageY + 28
  );
  ctx.textAlign = 'right';
  ctx.fillText(drink.shaken ? 'SHAKEN · 摇匀特调' : 'LAYERED · 分层静置', stageX + stageW - 20, stageY + 28);

  // 绘制高清成品酒杯
  drawCocktailIllustration(ctx, drink, W / 2, stageY + 220);

  // 如果解锁经典配方，盖酒红印章
  if (drink.isClassic) {
    ctx.save();
    ctx.translate(stageX + stageW - 102, stageY + 98);
    ctx.rotate(-0.18);
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(143, 29, 44, 0.9)';
    drawRoundedRect(ctx, -78, -26, 156, 52, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F5EBD6';
    ctx.font = '700 15px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('经典隐藏配方', 0, -5);
    ctx.fillStyle = '#E5A93C';
    ctx.font = '600 11px Menlo, monospace';
    ctx.fillText('CLASSIC UNLOCKED', 0, 14);
    ctx.restore();
  }

  // 如果有挑战星级
  if (challengeStars) {
    ctx.fillStyle = '#E5A93C';
    ctx.font = '700 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('★'.repeat(challengeStars) + '☆'.repeat(5 - challengeStars), stageX + 20, stageY + stageH - 24);
  }

  // 5. 酒名与调酒师微醺评语
  let cursorY = stageY + stageH + 46;
  ctx.fillStyle = '#1B110D';
  ctx.font = '700 44px Georgia, "Songti SC", "PingFang SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(drink.name, W / 2, cursorY);

  cursorY += 32;
  ctx.fillStyle = '#8F1D2C';
  ctx.font = 'italic 600 19px Georgia, serif';
  ctx.fillText(drink.enName.toUpperCase(), W / 2, cursorY);

  cursorY += 34;
  ctx.fillStyle = '#4B352A';
  ctx.font = '400 20px "PingFang SC", sans-serif';
  cursorY = wrapChineseText(ctx, `“${drink.bartenderNote}”`, W / 2, cursorY, W - 120, 30, 3);

  // 分隔装饰线
  const divY = Math.max(cursorY + 14, 725);
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(52, divY);
  ctx.lineTo(W - 52, divY);
  ctx.stroke();

  // 6. 中下双栏：左配方比例，右五维雷达 + ABV
  const infoY = divY + 34;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8F1D2C';
  ctx.font = '700 17px Menlo, "PingFang SC", sans-serif';
  ctx.fillText('RECIPE · 专属配方比例', 56, infoY);

  const layers = computeLiquidLayers(drink.pours).sort((a, b) => b.ml - a.ml);
  let rowY = infoY + 36;
  layers.slice(0, 6).forEach((layer) => {
    const pct = Math.round(layer.ratio * 100);
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.arc(66, rowY - 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(27,17,13,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#1B110D';
    ctx.font = '600 19px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(layer.name, 84, rowY);

    ctx.fillStyle = '#6B5142';
    ctx.font = '600 16px Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${layer.ml}ml · ${pct}%`, 368, rowY);
    rowY += 34;
  });

  // 竖分隔线
  ctx.strokeStyle = 'rgba(200, 155, 84, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(396, infoY - 12);
  ctx.lineTo(396, infoY + 258);
  ctx.stroke();

  // 右栏：ABV 徽章 + 五维雷达
  ctx.fillStyle = '#1B110D';
  drawRoundedRect(ctx, 424, infoY - 14, 268, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#C7B69C';
  ctx.font = '600 14px Menlo, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('EST. ABV 酒精度', 442, infoY + 12);
  ctx.fillStyle = '#E5A93C';
  ctx.font = '700 28px Georgia, Menlo, serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${drink.abv.toFixed(1)}%`, 674, infoY + 13);

  drawPosterRadar(ctx, drink.flavor, 558, infoY + 158, 76);

  // 7. 底部虚线票根 + 真实公网二维码
  const ticketY = 1072;
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = '#8F1D2C';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(46, ticketY);
  ctx.lineTo(W - 46, ticketY);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1B110D';
  ctx.font = '700 26px Georgia, "Songti SC", serif';
  ctx.fillText('今夜，微醺正好。', 58, ticketY + 62);

  ctx.fillStyle = '#5D4437';
  ctx.font = '400 18px "PingFang SC", sans-serif';
  ctx.fillText('扫码进入「微醺研究所 · MixLab」', 58, ticketY + 102);
  ctx.fillText('亲手调制你的专属风味特调酒单', 58, ticketY + 132);

  ctx.fillStyle = '#8F1D2C';
  ctx.font = '600 13px Menlo, monospace';
  ctx.fillText(APP_CONFIG.publicUrl, 58, ticketY + 174);

  // 生成高容错高清二维码并绘制到海报右下角
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, APP_CONFIG.publicUrl, {
    width: 162,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1B110D',
      light: '#FFFDF8',
    },
  });

  const qrBoxX = W - 224;
  const qrBoxY = ticketY + 34;
  ctx.fillStyle = '#FFFDF8';
  drawRoundedRect(ctx, qrBoxX - 6, qrBoxY - 6, 174, 174, 8);
  ctx.fill();
  ctx.strokeStyle = '#2B1912';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.drawImage(qrCanvas, qrBoxX, qrBoxY, 162, 162);

  return canvas.toDataURL('image/png', 0.96);
}

/**
 * 生成 1080×1920 超清「微醺研究所 · MixLab 官方产品介绍二维码海报」
 * 复古奶油特种纸 + 黑胡桃烫金画框双拼杂志画报风
 */
export async function generateBrandIntroPosterDataUrl(): Promise<string> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // 1. 复古奶油特种纸底色 + 细微纸张颗粒
  ctx.fillStyle = '#F5EBD6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(92, 62, 42, 0.036)';
  for (let i = 0; i < 680; i += 1) {
    ctx.fillRect((i * 113) % W, (i * 211) % H, 2, 2);
  }

  // 2. 双层深褐/古铜烫金边框 + Art Deco 角饰
  ctx.strokeStyle = '#1D110C';
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  // 3. 顶部黑金刊头横幅
  const headerX = 66;
  const headerY = 66;
  const headerW = W - 132;
  ctx.fillStyle = '#140C09';
  drawRoundedRect(ctx, headerX, headerY, headerW, 118, 8);
  ctx.fill();
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = '#E5A93C';
  ctx.font = '600 20px Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('EST. 2026 · SPEAKEASY DIGITAL BAR', headerX + 34, headerY + 40);

  ctx.fillStyle = '#F5EBD6';
  ctx.font = '700 38px Georgia, "Songti SC", serif';
  ctx.fillText('MIXLAB · 微醺研究所', headerX + 34, headerY + 84);

  // 右上角复古邀请函标签
  ctx.fillStyle = '#8F1D2C';
  drawRoundedRect(ctx, headerX + headerW - 224, headerY + 34, 192, 50, 6);
  ctx.fill();
  ctx.strokeStyle = '#E5A93C';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#F5EBD6';
  ctx.font = '700 20px Menlo, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OFFICIAL INVITE', headerX + headerW - 128, headerY + 60);

  // 4. 中上黑金丝绒酒馆主视觉画框（展示三杯代表性分层特调插画）
  const stageX = 66;
  const stageY = 208;
  const stageW = W - 132;
  const stageH = 590;

  const stageGrad = ctx.createLinearGradient(stageX, stageY, stageX, stageY + stageH);
  stageGrad.addColorStop(0, '#1D100D');
  stageGrad.addColorStop(0.65, '#120A08');
  stageGrad.addColorStop(1, '#1E120C');
  ctx.fillStyle = stageGrad;
  drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 14);
  ctx.fill();
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 画框内部丝绒暖光晕 + 胡桃木吧台弧线
  const centerGlow = ctx.createRadialGradient(W / 2, stageY + 290, 30, W / 2, stageY + 290, 390);
  centerGlow.addColorStop(0, 'rgba(229, 145, 56, 0.25)');
  centerGlow.addColorStop(0.55, 'rgba(143, 29, 44, 0.16)');
  centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(stageX + 2, stageY + 2, stageW - 4, stageH - 4);

  // 吧台桌面光弧
  ctx.strokeStyle = 'rgba(200, 155, 84, 0.36)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(stageX + 24, stageY + 474);
  ctx.quadraticCurveTo(W / 2, stageY + 448, stageX + stageW - 24, stageY + 474);
  ctx.stroke();

  // 画框顶角微标
  ctx.fillStyle = 'rgba(229, 169, 60, 0.78)';
  ctx.font = '600 18px Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SIGNATURE COLLECTION · 01 / 02 / 03', stageX + 30, stageY + 38);
  ctx.textAlign = 'right';
  ctx.fillText('16 INGREDIENTS · 12 CLASSICS', stageX + stageW - 30, stageY + 38);

  // 构造三杯代表性经典特调数据并绘制到主视觉画框
  const makeShowcaseDrink = (
    glassId: GlassId,
    iceType: IceType,
    garnishes: DrinkEvaluation['garnishes'],
    pours: DrinkEvaluation['pours'],
    blendedColor: string,
    hasBubbles: boolean,
    shaken: boolean
  ): DrinkEvaluation => ({
    serialNo: 'ML-000',
    name: '',
    enName: '',
    isClassic: true,
    bartenderNote: '',
    abv: 18,
    totalMl: 180,
    flavor: { sour: 45, sweet: 55, bitter: 40, strong: 60, refreshing: 75 },
    blendedColor,
    colorFamily: 'amber',
    hasBubbles,
    glassId,
    iceType,
    garnishes,
    pours,
    shaken,
    createdAt: new Date().toISOString(),
  });

  // 左：马天尼杯 · 蓝色泻湖
  ctx.save();
  ctx.translate(274, stageY + 332);
  ctx.scale(0.86, 0.86);
  drawCocktailIllustration(
    ctx,
    makeShowcaseDrink(
      'martini',
      'none',
      ['cherry'],
      [
        { ingredientId: 'blue_curacao', ml: 70 },
        { ingredientId: 'lime_juice', ml: 40 },
        { ingredientId: 'vodka', ml: 60 },
      ],
      '#15A3E6',
      true,
      false
    ),
    0,
    0
  );
  ctx.restore();

  // 右：高球杯 · 龙舌兰日出（经典三层密度渐变）
  ctx.save();
  ctx.translate(806, stageY + 324);
  ctx.scale(0.9, 0.9);
  drawCocktailIllustration(
    ctx,
    makeShowcaseDrink(
      'highball',
      'cubes',
      ['lime', 'mint'],
      [
        { ingredientId: 'grenadine', ml: 45 },
        { ingredientId: 'orange_juice', ml: 95 },
        { ingredientId: 'tequila', ml: 60 },
        { ingredientId: 'soda', ml: 20 },
      ],
      '#F2742C',
      true,
      false
    ),
    0,
    0
  );
  ctx.restore();

  // 中 C 位：古典杯 · 琥珀内格罗尼（手凿晶莹大冰球）
  ctx.save();
  ctx.translate(W / 2, stageY + 344);
  ctx.scale(1.06, 1.06);
  // 中心杯垫
  ctx.fillStyle = '#25160E';
  ctx.strokeStyle = '#E5A93C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 118, 92, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawCocktailIllustration(
    ctx,
    makeShowcaseDrink(
      'rocks',
      'sphere',
      ['orange_peel', 'rosemary'],
      [
        { ingredientId: 'campari', ml: 60 },
        { ingredientId: 'vermouth', ml: 60 },
        { ingredientId: 'whiskey', ml: 60 },
      ],
      '#B93129',
      false,
      false
    ),
    0,
    0
  );
  ctx.restore();

  // 三杯底部名称角标
  ctx.font = '600 18px "PingFang SC", sans-serif';
  ctx.fillStyle = '#D9C7AE';
  ctx.textAlign = 'center';
  ctx.fillText('蓝色泻湖 · Martini', 274, stageY + 538);
  ctx.fillStyle = '#E5A93C';
  ctx.font = '700 20px "PingFang SC", sans-serif';
  ctx.fillText('手凿大冰球 · Rocks', W / 2, stageY + 544);
  ctx.fillStyle = '#D9C7AE';
  ctx.font = '600 18px "PingFang SC", sans-serif';
  ctx.fillText('龙舌兰日出 · Highball', 806, stageY + 538);

  // 5. 中部主标题与引言
  ctx.fillStyle = '#1B110D';
  ctx.font = '700 72px Georgia, "Songti SC", "PingFang SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText('微 醺 研 究 所', W / 2, 872);

  ctx.fillStyle = '#8F1D2C';
  ctx.font = 'italic 700 26px Georgia, serif';
  ctx.fillText('MIXLAB · IMMERSIVE SPEAKEASY ATELIER', W / 2, 926);

  ctx.fillStyle = '#4B352A';
  ctx.font = '500 28px "PingFang SC", sans-serif';
  ctx.fillText('“不必等夜深，指尖倾倒属于你的今夜风味”', W / 2, 978);

  // 细金分隔线
  ctx.strokeStyle = '#C89B54';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(86, 1024);
  ctx.lineTo(W - 86, 1024);
  ctx.stroke();

  // 6. 中下双栏：左侧三大核心玩法亮点，右侧五维风味美学标识
  const feats = [
    {
      num: 'I.',
      title: '四步沉浸调酒 · 真实密度分层',
      desc: '3 款水晶杯 × 手凿大冰球 × 16 种原料，气泡与渐变实时呈现',
    },
    {
      num: 'II.',
      title: '风味演算引擎 · 12 款经典图鉴',
      desc: '精准计算 ABV 与五维风味雷达，探索 12 款隐藏经典酒谱',
    },
    {
      num: 'III.',
      title: '微醺盲品客单 · 复古海报酒柜',
      desc: '接待深夜神秘酒客赢星级点评，一键导出专属特调酒单',
    },
  ];

  let featY = 1078;
  feats.forEach((f) => {
    ctx.fillStyle = '#8F1D2C';
    ctx.font = '700 28px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(f.num, 80, featY);

    ctx.fillStyle = '#1B110D';
    ctx.font = '700 26px "PingFang SC", sans-serif';
    ctx.fillText(f.title, 146, featY);

    ctx.fillStyle = '#5B4335';
    ctx.font = '400 20px "PingFang SC", sans-serif';
    wrapChineseText(ctx, f.desc, 146, featY + 38, 526, 29, 2);

    featY += 126;
  });

  // 竖分隔线
  ctx.strokeStyle = 'rgba(200, 155, 84, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(702, 1054);
  ctx.lineTo(702, 1430);
  ctx.stroke();

  // 右侧：五维风味美学标识卡
  ctx.fillStyle = '#1B110D';
  drawRoundedRect(ctx, 736, 1062, 266, 54, 8);
  ctx.fill();
  ctx.fillStyle = '#E5A93C';
  ctx.font = '700 20px Menlo, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FLAVOR MATRIX', 869, 1089);

  drawPosterRadar(
    ctx,
    { sour: 68, sweet: 74, bitter: 46, strong: 64, refreshing: 88 },
    869,
    1248,
    92
  );

  ctx.fillStyle = '#6B5142';
  ctx.font = '600 18px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('酸 · 甜 · 苦 · 烈 · 清爽', 869, 1396);
  ctx.fillStyle = '#8F1D2C';
  ctx.font = '600 16px Menlo, monospace';
  ctx.fillText('SHAKE · STIR · DISCOVER', 869, 1424);

  // 7. 底部复古虚线票根邀请区 + 高清真实公网二维码
  const ticketY = 1488;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = '#8F1D2C';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(66, ticketY);
  ctx.lineTo(W - 66, ticketY);
  ctx.stroke();
  ctx.restore();

  // 票根左右半圆缺口装饰
  ctx.fillStyle = '#1D110C';
  ctx.beginPath();
  ctx.arc(34, ticketY, 16, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W - 34, ticketY, 16, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.fill();

  // 左侧扫码邀请文案
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8F1D2C';
  ctx.font = '700 22px Menlo, monospace';
  ctx.fillText('SPEAKEASY PASS · 线上免费畅玩', 82, ticketY + 68);

  ctx.fillStyle = '#1B110D';
  ctx.font = '700 42px Georgia, "Songti SC", "PingFang SC", serif';
  ctx.fillText('扫码推开吧台暗门', 82, ticketY + 132);

  ctx.fillStyle = '#4B352A';
  ctx.font = '500 26px "PingFang SC", sans-serif';
  ctx.fillText('亲手调制你的专属微醺特调', 82, ticketY + 186);
  ctx.fillText('生成复古酒单海报 · 收藏经典图鉴', 82, ticketY + 226);

  // 公网 URL 胶囊
  ctx.fillStyle = '#1B110D';
  drawRoundedRect(ctx, 82, ticketY + 266, 560, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#E5A93C';
  ctx.font = '600 21px Menlo, monospace';
  ctx.fillText(APP_CONFIG.publicUrl, 104, ticketY + 292);

  // 右侧高容错 H 级公网二维码（264×264）
  const qrSize = 264;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, APP_CONFIG.publicUrl, {
    width: qrSize,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#140C09',
      light: '#FFFFFF',
    },
  });

  const qrBoxX = W - 82 - qrSize - 18;
  const qrBoxY = ticketY + 52;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrSize + 18, qrSize + 18, 12);
  ctx.fill();
  ctx.strokeStyle = '#1B110D';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.drawImage(qrCanvas, qrBoxX + 9, qrBoxY + 9, qrSize, qrSize);

  ctx.fillStyle = '#6B5142';
  ctx.font = '600 17px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('微信 / 相机扫码即刻入座', qrBoxX + (qrSize + 18) / 2, qrBoxY + qrSize + 44);

  return canvas.toDataURL('image/png', 0.96);
}

