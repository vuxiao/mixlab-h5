/**
 * 实时液体渲染引擎（Canvas 2D）
 *
 * 不是贴图，也不是 CSS 关键帧：每一帧都由物理状态实时计算后绘制——
 * - 液面高度：弹簧阻尼系统，倒酒后平滑上涨并带轻微回弹
 * - 液面波纹：一维波动方程高度场，倾倒冲击/摇晃会激起涟漪并自然衰减
 * - 晃动：杯体按正弦摇晃，液面倾角由惯性弹簧驱动（停手后仍会余波荡漾）
 * - 分层与融合：各层占比平滑过渡；摇晃时层间产生湍流纹理，颜色随融合度向混合色收敛
 * - 倾倒：液柱受重力下落、冲击液面溅起液滴，倒入的颜色以「染料团」按密度下沉扩散
 * - 气泡：碳酸气泡上浮至实时液面
 *
 * 只在有东西在动时运行 rAF，静止后渲染最后一帧并完全停帧（不空转）。
 */
import { GlassId } from '../types';
import { hexToRgb, mixHexColors } from './flavorEngine';

export interface GlassGeometry {
  cavityPath: string;
  topY: number;
  bottomY: number;
  rimLeftX: number;
  rimRightX: number;
  rimY: number;
  bottomLeftX: number;
  bottomRightX: number;
}

export const GLASS_GEOMETRY: Record<GlassId, GlassGeometry> = {
  martini: {
    cavityPath: 'M 42 54 L 198 54 L 125 148 L 115 148 Z',
    topY: 54,
    bottomY: 148,
    rimLeftX: 42,
    rimRightX: 198,
    rimY: 54,
    bottomLeftX: 115,
    bottomRightX: 125,
  },
  rocks: {
    cavityPath: 'M 58 84 L 182 84 L 172 214 L 68 214 Z',
    topY: 84,
    bottomY: 214,
    rimLeftX: 58,
    rimRightX: 182,
    rimY: 84,
    bottomLeftX: 68,
    bottomRightX: 172,
  },
  highball: {
    cavityPath: 'M 74 44 L 166 44 L 158 220 L 82 220 Z',
    topY: 44,
    bottomY: 220,
    rimLeftX: 74,
    rimRightX: 166,
    rimY: 44,
    bottomLeftX: 82,
    bottomRightX: 158,
  },
};

export function cavityHalfWidth(g: GlassGeometry, y: number): number {
  const t = Math.min(1, Math.max(0, (y - g.topY) / (g.bottomY - g.topY)));
  const top = (g.rimRightX - g.rimLeftX) / 2;
  const bottom = (g.bottomRightX - g.bottomLeftX) / 2;
  return top + (bottom - top) * t;
}

export interface LiquidLayerInput {
  id: string;
  color: string;
  glow: string;
  opacity: number;
  ml: number;
  density: number;
}

export interface LiquidSceneState {
  glassId: GlassId;
  /** 自下而上（密度大在前） */
  layers: LiquidLayerInput[];
  fillRatio: number;
  blendedColor: string;
  /** 0-1 融合度 */
  mix: number;
  carbonated: boolean;
  pour: { color: string; glow: string; density: number } | null;
  shaking: boolean;
  /** 页面可见且未被首屏遮挡 */
  running: boolean;
  reducedMotion: boolean;
}

/* ------------------------------------------------------------------ */

const VB_W = 240;
const VB_H = 260;
const CX = 120;
const COLS = 49; // 液面高度场列数
const COL_X0 = 0;
const COL_DX = VB_W / (COLS - 1);
const MAX_BLOBS = 34;
const MAX_DROPS = 28;

interface DisplayLayer {
  id: string;
  frac: number;
  target: number;
  color: string;
  glow: string;
  opacity: number;
  density: number;
}

interface DyeBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  seed: number;
  rgb: { r: number; g: number; b: number };
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  rgb: { r: number; g: number; b: number };
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  alpha: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp(a, 0, 1).toFixed(3)})`;

export class LiquidRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly shakeEl: HTMLElement | null;
  private state: LiquidSceneState;
  private geo: GlassGeometry;

  private raf = 0;
  private lastT = 0;
  private time = 0;
  private sx = 1;
  private sy = 1;
  private dpr = 1;

  // 物理状态
  private level = 0;
  private levelV = 0;
  private mixD = 0;
  private turb = 0;
  private slope = 0;
  private slopeV = 0;
  private shakeAmp = 0;
  private shakePhase = 0;
  private readonly h = new Float32Array(COLS);
  private readonly hv = new Float32Array(COLS);
  private layers: DisplayLayer[] = [];
  private blobs: DyeBlob[] = [];
  private drops: Drop[] = [];
  private bubbles: Bubble[] = [];
  private stream: {
    head: number;
    headV: number;
    tail: number | null;
    tailV: number;
    rgb: { r: number; g: number; b: number };
    glow: { r: number; g: number; b: number };
    density: number;
    on: boolean;
  } | null = null;
  private spawnAcc = 0;
  /** 自适应清晰度：帧耗时持续偏高时自动降低画布分辨率，保证不卡顿 */
  private quality = 1;
  private frameEma = 16.7;
  private slowFrames = 0;
  private dropAcc = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, shakeEl: HTMLElement | null, initial: LiquidSceneState) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.shakeEl = shakeEl;
    this.state = initial;
    this.geo = GLASS_GEOMETRY[initial.glassId];
    // 初始直接落在目标状态，首屏不播放多余动画
    this.level = initial.fillRatio;
    this.mixD = initial.mix;
    this.syncLayers(true);
    this.bubbles = Array.from({ length: 34 }, () => this.newBubble(true));
    this.resize();
  }

  /* ------------------------------ 公共接口 ------------------------------ */

  setState(next: LiquidSceneState) {
    const prev = this.state;
    this.state = next;
    if (next.glassId !== prev.glassId) {
      this.geo = GLASS_GEOMETRY[next.glassId];
        this.h.fill(0);
      this.hv.fill(0);
      this.blobs = [];
      this.drops = [];
      this.bubbles = Array.from({ length: 34 }, () => this.newBubble(true));
    }
    // 开始/结束倾倒：液柱从瓶口落下 / 尾部脱离下坠
    if (next.pour && (!this.stream || !this.stream.on)) {
      this.stream = {
        head: -6,
        headV: 140,
        tail: null,
        tailV: 0,
        rgb: hexToRgb(next.pour.color),
        glow: hexToRgb(next.pour.glow),
        density: next.pour.density,
        on: true,
      };
    } else if (next.pour && this.stream) {
      this.stream.rgb = hexToRgb(next.pour.color);
      this.stream.glow = hexToRgb(next.pour.glow);
      this.stream.density = next.pour.density;
    } else if (!next.pour && this.stream?.on) {
      this.stream.on = false;
      this.stream.tail = -6;
      this.stream.tailV = 160;
    }
    this.syncLayers(false);
    if (next.reducedMotion) this.snapToTargets();
    this.wake();
  }

  resize() {
    const cw = this.canvas.clientWidth || 240;
    const ch = this.canvas.clientHeight || 260;
    // 液体是柔边内容，1.5 倍密度在视网膜屏上已足够细腻，且像素量比 2 倍少 44%
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1) * this.quality;
    const w = Math.round(cw * this.dpr);
    const hh = Math.round(ch * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== hh) {
      this.canvas.width = w;
      this.canvas.height = hh;
    }
    this.sx = cw / VB_W;
    this.sy = ch / VB_H;
    this.draw();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.shakeEl) this.shakeEl.style.transform = '';
  }

  /* ------------------------------ 循环调度 ------------------------------ */

  private wake() {
    if (this.destroyed) return;
    if (!this.state.running || this.state.reducedMotion) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.shakeEl && this.state.reducedMotion) this.shakeEl.style.transform = '';
      this.draw();
      return;
    }
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.destroyed) return;
    const rawMs = now - this.lastT;
    const dt = clamp(rawMs / 1000, 0, 1 / 30);
    this.lastT = now;
    this.adaptQuality(rawMs);
    this.step(dt);
    this.draw();
    if (this.state.running && !this.state.reducedMotion && this.isBusy()) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.settle();
    }
  };

  private adaptQuality(frameMs: number) {
    if (frameMs > 100) return; // 切后台/首帧等异常值忽略
    this.frameEma = this.frameEma * 0.9 + frameMs * 0.1;
    if (this.frameEma > 21 && this.quality > 0.66) {
      this.slowFrames += 1;
      if (this.slowFrames > 10) {
        this.quality = Math.max(0.66, this.quality - 0.17);
        this.slowFrames = 0;
        this.frameEma = 16.7;
        this.resize();
      }
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
    }
  }

  /** 静止判定：任何物理量仍在变化就继续跑帧 */
  private isBusy(): boolean {
    const s = this.state;
    if (s.pour || s.shaking || this.stream) return true;
    if (this.blobs.length || this.drops.length) return true;
    if (s.carbonated && this.level > 0.04) return true;
    if (Math.abs(this.level - s.fillRatio) > 0.0006 || Math.abs(this.levelV) > 0.002) return true;
    if (Math.abs(this.mixD - s.mix) > 0.002 || this.turb > 0.01) return true;
    if (this.shakeAmp > 0.003 || Math.abs(this.slope) > 0.002 || Math.abs(this.slopeV) > 0.01) return true;
    for (const l of this.layers) if (Math.abs(l.frac - l.target) > 0.002) return true;
    let e = 0;
    for (let i = 0; i < COLS; i += 1) e += Math.abs(this.h[i]) + Math.abs(this.hv[i]) * 0.05;
    return e > 0.25;
  }

  /** 停帧前把残余微小量归零，保证最后一帧干净 */
  private settle() {
    this.h.fill(0);
    this.hv.fill(0);
    this.slope = 0;
    this.slopeV = 0;
    this.shakeAmp = 0;
    this.turb = 0;
    this.level = this.state.fillRatio;
    this.levelV = 0;
    this.mixD = this.state.mix;
    this.layers = this.layers.filter((l) => l.target > 0);
    this.layers.forEach((l) => (l.frac = l.target));
    if (this.shakeEl) this.shakeEl.style.transform = '';
    this.draw();
  }

  private snapToTargets() {
    this.settle();
    this.blobs = [];
    this.drops = [];
    this.stream = null;
  }

  /* ------------------------------ 状态同步 ------------------------------ */

  private syncLayers(snap: boolean) {
    const s = this.state;
    const total = s.layers.reduce((sum, l) => sum + l.ml, 0);
    // 清空杯子：保留现有层，等液面降到底再移除，避免颜色瞬间消失
    if (total <= 0) {
      if (snap) this.layers = [];
      return;
    }
    const seen = new Set<string>();
    s.layers.forEach((l) => {
      seen.add(l.id);
      const target = l.ml / total;
      const ex = this.layers.find((d) => d.id === l.id);
      if (ex) {
        ex.target = target;
        ex.color = l.color;
        ex.glow = l.glow;
        ex.opacity = l.opacity;
        ex.density = l.density;
        if (snap) ex.frac = target;
      } else {
        this.layers.push({ ...l, frac: snap ? target : 0, target });
      }
    });
    this.layers.forEach((d) => {
      if (!seen.has(d.id)) d.target = 0;
    });
    this.layers.sort((a, b) => b.density - a.density);
  }

  private newBubble(scatter: boolean): Bubble {
    const g = this.geo;
    const top = g.bottomY - (g.bottomY - g.topY) * Math.max(0.05, this.level);
    return {
      x: CX + rand(-0.5, 0.5) * 60,
      y: scatter ? rand(top, g.bottomY) : g.bottomY - rand(2, 14),
      r: rand(0.9, 2.6),
      vy: rand(14, 42),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.35, 0.85),
    };
  }

  /* ------------------------------ 物理步进 ------------------------------ */

  private surfaceBaseY(): number {
    const g = this.geo;
    return g.bottomY - (g.bottomY - g.topY) * this.level;
  }

  private waveAt(x: number): number {
    const f = clamp((x - COL_X0) / COL_DX, 0, COLS - 1.001);
    const i = Math.floor(f);
    const t = f - i;
    return this.h[i] * (1 - t) + this.h[i + 1] * t + this.slope * (x - CX);
  }

  private step(dt: number) {
    const s = this.state;
    this.time += dt;

    // 1) 液面高度弹簧（轻微欠阻尼，带 iOS 式回弹）
    const k = 140;
    const c = 2 * Math.sqrt(k) * 0.78;
    this.levelV += (k * (s.fillRatio - this.level) - c * this.levelV) * dt;
    this.level = clamp(this.level + this.levelV * dt, 0, 1.02);

    // 2) 分层占比平滑过渡
    const lf = 1 - Math.exp(-dt * 7);
    this.layers.forEach((l) => (l.frac += (l.target - l.frac) * lf));
    if (s.layers.length > 0) this.layers = this.layers.filter((l) => l.target > 0 || l.frac > 0.003);
    else if (this.level < 0.004) this.layers = [];

    // 3) 融合度 & 湍流
    this.mixD += (s.mix - this.mixD) * (1 - Math.exp(-dt * 3.2));
    this.turb = s.shaking ? Math.min(1, this.turb + dt * 5) : Math.max(0, this.turb - dt * 1.1);

    // 4) 杯体摇晃（振幅渐入渐出）+ 液面惯性倾角
    const ampTarget = s.shaking ? 1 : 0;
    this.shakeAmp += (ampTarget - this.shakeAmp) * (1 - Math.exp(-dt * (s.shaking ? 14 : 8)));
    this.shakePhase += dt * Math.PI * 2 * 5.2;
    const slopeTarget = this.shakeAmp * 0.3 * Math.sin(this.shakePhase - 1.1);
    this.slopeV += (90 * (slopeTarget - this.slope) - 5.5 * this.slopeV) * dt;
    this.slope = clamp(this.slope + this.slopeV * dt, -0.42, 0.42);
    if (this.shakeEl) {
      if (this.shakeAmp > 0.003) {
        const a = this.shakeAmp;
        const x = a * 6.5 * Math.sin(this.shakePhase);
        const y = a * 2.4 * Math.sin(this.shakePhase * 2 + 0.6);
        const r = a * 5 * Math.sin(this.shakePhase + 0.35);
        this.shakeEl.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(2)}deg)`;
      } else if (this.shakeEl.style.transform) {
        this.shakeEl.style.transform = '';
      }
    }

    // 5) 液面波动方程（固定子步长保证稳定）
    const impactCol = Math.round((CX - COL_X0) / COL_DX);
    const streamHits = this.stream && this.stream.head >= this.surfaceBaseY() - 1;
    let remaining = dt;
    while (remaining > 1e-5) {
      const h = Math.min(remaining, 1 / 120);
      remaining -= h;
      if (streamHits) {
        this.hv[impactCol] -= 300 * h * rand(0.6, 1.4);
        this.hv[impactCol - 1] -= 120 * h;
        this.hv[impactCol + 1] -= 120 * h;
      }
      if (this.shakeAmp > 0.05) {
        const j = (Math.random() * COLS) | 0;
        this.hv[j] += rand(-1, 1) * 900 * this.shakeAmp * h;
      }
      for (let i = 0; i < COLS; i += 1) {
        const l = this.h[i > 0 ? i - 1 : 1];
        const r = this.h[i < COLS - 1 ? i + 1 : COLS - 2];
        const a = 150 * (l + r - 2 * this.h[i]) - 7 * this.h[i] - 3.4 * this.hv[i];
        this.hv[i] += a * h;
      }
      for (let i = 0; i < COLS; i += 1) {
        this.h[i] = clamp(this.h[i] + this.hv[i] * h, -6, 6);
      }
    }

    // 6) 液柱：头部重力下落直到液面，尾部脱离后同样下坠
    const surfaceY = this.surfaceBaseY() + this.waveAt(CX);
    if (this.stream) {
      const st = this.stream;
      st.headV += 1500 * dt;
      st.head = Math.min(surfaceY, st.head + st.headV * dt);
      if (st.tail !== null) {
        st.tailV += 1500 * dt;
        st.tail += st.tailV * dt;
        if (st.tail >= st.head) this.stream = null;
      }
    }

    // 7) 冲击溅起液滴 + 染料团（倒入颜色按密度下沉扩散）
    const hitting = this.stream && this.stream.head >= surfaceY - 0.5 && (this.stream.tail ?? -1) < surfaceY;
    if (hitting && this.stream) {
      const st = this.stream;
      this.dropAcc += dt;
      while (this.dropAcc > 0.028) {
        this.dropAcc -= 0.028;
        if (this.drops.length < MAX_DROPS) {
          this.drops.push({
            x: CX + rand(-2, 2),
            y: surfaceY - 1,
            vx: rand(-60, 60),
            vy: -rand(45, 120),
            r: rand(0.7, 1.7),
            life: 0,
            rgb: st.glow,
          });
        }
      }
      if (this.level > 0.02) {
        this.spawnAcc += dt;
        const avgDensity =
          this.layers.reduce((sum, l) => sum + l.density * l.frac, 0) /
          Math.max(0.001, this.layers.reduce((sum, l) => sum + l.frac, 0));
        const sink = clamp((st.density - avgDensity) * 900, -30, 70);
        while (this.spawnAcc > 0.045) {
          this.spawnAcc -= 0.045;
          if (this.blobs.length < MAX_BLOBS) {
            this.blobs.push({
              x: CX + rand(-3, 3),
              y: surfaceY + 3,
              vx: rand(-14, 14),
              vy: 46 + sink + rand(-8, 8),
              life: 0,
              max: rand(1.0, 1.6),
              seed: rand(0, 10),
              rgb: st.rgb,
            });
          }
        }
      }
    } else {
      this.dropAcc = 0;
      this.spawnAcc = 0;
    }

    const bottom = this.geo.bottomY;
    this.blobs = this.blobs.filter((b) => {
      b.life += dt;
      b.vy *= Math.exp(-dt * 1.7);
      b.vx += Math.sin(this.time * 2.6 + b.seed) * 26 * dt;
      b.vx *= Math.exp(-dt * 1.2);
      b.x += b.vx * dt;
      b.y = Math.min(bottom - 4, b.y + b.vy * dt);
      return b.life < b.max;
    });
    this.drops = this.drops.filter((d) => {
      d.life += dt;
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const sy = this.surfaceBaseY() + this.waveAt(d.x);
      return d.life < 0.9 && !(d.vy > 0 && d.y > sy);
    });

    // 8) 气泡上浮
    const fizz = s.carbonated ? 1 : s.pour || s.shaking ? 0.35 : 0;
    if (fizz > 0 && this.level > 0.04) {
      const speed = s.shaking ? 2.3 : s.pour ? 1.6 : 1;
      const count = Math.round(this.bubbles.length * fizz);
      for (let i = 0; i < count; i += 1) {
        const b = this.bubbles[i];
        b.y -= b.vy * speed * dt;
        b.phase += dt * 3;
        const surf = this.surfaceBaseY() + this.waveAt(b.x);
        if (b.y < surf + 2 || b.y > this.geo.bottomY) Object.assign(b, this.newBubble(false));
      }
    }
  }

  /* -------------------------------- 绘制 -------------------------------- */

  /** 染料团贴图缓存：每种颜色只生成一次柔边径向贴图，之后每帧 drawImage（避免逐帧新建渐变） */
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private blobSprite(rgb: { r: number; g: number; b: number }): HTMLCanvasElement {
    const key = `${rgb.r | 0},${rgb.g | 0},${rgb.b | 0}`;
    let c = this.spriteCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      if (x) {
        const rg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        rg.addColorStop(0, rgba(rgb, 1));
        rg.addColorStop(0.45, rgba(rgb, 0.55));
        rg.addColorStop(1, rgba(rgb, 0));
        x.fillStyle = rg;
        x.fillRect(0, 0, 64, 64);
      }
      if (this.spriteCache.size > 24) this.spriteCache.clear();
      this.spriteCache.set(key, c);
    }
    return c;
  }

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.sx, 0, 0, this.dpr * this.sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const g = this.geo;
    const L = this.surfaceBaseY();
    const hasLiquid = this.layers.length > 0 && this.level > 0.003;

    // 不再整帧裁剪杯腔（裁剪在 GPU 上很贵）：液体轮廓本身沿杯壁构建
    if (hasLiquid) this.drawBody(L);

    // 溅起的液滴（限制在杯壁内侧）
    if (this.drops.length) {
      for (const d of this.drops) {
        if (d.y < g.topY + 2) continue;
        const lim = cavityHalfWidth(g, d.y) - d.r - 0.5;
        if (Math.abs(d.x - CX) > lim) continue;
        ctx.globalAlpha = 0.85 * (1 - d.life / 0.9);
        ctx.fillStyle = rgba(d.rgb, 1);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 气泡：合并为 3 次绘制调用（主体 / 描边 / 高光）
    const s = this.state;
    const fizz = s.carbonated ? 1 : s.pour || s.shaking ? 0.35 : 0;
    if (hasLiquid && fizz > 0 && this.level > 0.04) {
      const count = Math.round(this.bubbles.length * fizz);
      const body = new Path2D();
      const hi = new Path2D();
      for (let i = 0; i < count; i += 1) {
        const b = this.bubbles[i];
        const hw = cavityHalfWidth(g, b.y) - b.r - 1.5;
        const x = clamp(b.x + Math.sin(b.phase) * 1.3, CX - hw, CX + hw);
        if (b.y < L + this.waveAt(x) + 1.5) continue;
        body.moveTo(x + b.r, b.y);
        body.arc(x, b.y, b.r, 0, Math.PI * 2);
        const hr = b.r * 0.3;
        hi.moveTo(x - b.r * 0.32 + hr, b.y - b.r * 0.32);
        hi.arc(x - b.r * 0.32, b.y - b.r * 0.32, hr, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(255,250,238,0.32)';
      ctx.fill(body);
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke(body);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fill(hi);
    }

    // 液柱（从画面顶端落入杯中，不裁剪）
    if (this.stream) this.drawStream();
  }

  private drawBody(L: number) {
    const ctx = this.ctx;
    const g = this.geo;
    const s = this.state;
    const mix = this.mixD;
    const blended = s.blendedColor;

    // —— 分层渐变：边界柔化程度随融合度/湍流增大 ——
    const totalFrac = this.layers.reduce((sum, l) => sum + l.frac, 0) || 1;
    const soft = 0.018 + mix * 0.38 + this.turb * 0.1;
    const grad = ctx.createLinearGradient(0, g.bottomY, 0, Math.min(L, g.bottomY - 1));
    let acc = 0;
    let lastOff = 0;
    let topColor = blended;
    let topAlpha = 0.85;
    const avgAlpha =
      this.layers.reduce((sum, l) => sum + clamp(l.opacity + 0.12, 0.55, 0.95) * l.frac, 0) / totalFrac;
    this.layers.forEach((l, idx) => {
      const a = acc / totalFrac;
      acc += l.frac;
      const b = acc / totalFrac;
      const col = mixHexColors(l.color, blended, mix);
      const alpha = clamp(l.opacity + 0.12, 0.55, 0.95) * (1 - mix) + avgAlpha * mix;
      const rgb = hexToRgb(col);
      let o1 = idx === 0 ? 0 : a + soft / 2;
      let o2 = idx === this.layers.length - 1 ? 1 : b - soft / 2;
      if (o1 > o2) o1 = o2 = (a + b) / 2;
      o1 = Math.max(lastOff, clamp(o1, 0, 1));
      o2 = Math.max(o1, clamp(o2, 0, 1));
      grad.addColorStop(o1, rgba(idx === 0 ? hexToRgb(mixHexColors(col, '#120B08', 0.14)) : rgb, alpha));
      grad.addColorStop(o2, rgba(rgb, alpha));
      lastOff = o2;
      topColor = col;
      topAlpha = alpha;
    });

    // —— 液面（带透视椭圆的实时波浪面） ——
    const hw = Math.max(2, cavityHalfWidth(g, L) - 0.5);
    const ry = clamp(hw * 0.1, 1.2, 7);
    const N = 28;
    const fx = new Float32Array(N + 1);
    const fy = new Float32Array(N + 1);
    const by = new Float32Array(N + 1);
    for (let i = 0; i <= N; i += 1) {
      const u = -1 + (2 * i) / N;
      const x = CX + u * hw;
      const e = Math.sqrt(Math.max(0, 1 - u * u));
      const w = this.waveAt(x);
      fx[i] = x;
      fy[i] = L + w + ry * e;
      by[i] = L + w - ry * e;
    }

    // 液体主体轮廓：液面前沿 → 右杯壁 → 杯底 → 左杯壁（无需裁剪）
    const bodyPath = new Path2D();
    bodyPath.moveTo(fx[0], fy[0]);
    for (let i = 1; i <= N; i += 1) bodyPath.lineTo(fx[i], fy[i]);
    bodyPath.lineTo(g.bottomRightX, g.bottomY);
    bodyPath.lineTo(g.bottomLeftX, g.bottomY);
    bodyPath.closePath();
    ctx.fillStyle = grad;
    ctx.fill(bodyPath);

    // 体积感：两侧暗、中心透 + 底部略沉（直接填充同一轮廓，不走裁剪）
    const side = ctx.createLinearGradient(CX - hw - 2, 0, CX + hw + 2, 0);
    side.addColorStop(0, 'rgba(10,5,3,0.34)');
    side.addColorStop(0.2, 'rgba(255,255,255,0.07)');
    side.addColorStop(0.5, 'rgba(255,255,255,0)');
    side.addColorStop(0.82, 'rgba(10,5,3,0.06)');
    side.addColorStop(1, 'rgba(10,5,3,0.36)');
    ctx.fillStyle = side;
    ctx.fill(bodyPath);
    const depth = ctx.createLinearGradient(0, g.bottomY, 0, L + (g.bottomY - L) * 0.55);
    depth.addColorStop(0, 'rgba(8,4,2,0.28)');
    depth.addColorStop(1, 'rgba(8,4,2,0)');
    ctx.fillStyle = depth;
    ctx.fill(bodyPath);

    const marble = this.turb * (1 - mix * 0.85);
    const needsClip = marble > 0.02;
    if (needsClip) {
    ctx.save();
    ctx.clip(bodyPath);

    // 湍流纹理：摇晃时各层颜色被卷起成流动的条纹，融合越充分越淡
    if (marble > 0.02) {
      const liquidH = g.bottomY - L;
      let a2 = 0;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4 + 7 * this.turb;
      this.layers.forEach((l, idx) => {
        const mid = g.bottomY - liquidH * ((a2 + l.frac / 2) / totalFrac);
        a2 += l.frac;
        const rgb = hexToRgb(mixHexColors(l.color, blended, mix * 0.6));
        ctx.strokeStyle = rgba(rgb, 0.42 * marble);
        ctx.beginPath();
        for (let k = 0; k < 2; k += 1) {
          const amp = (4 + 16 * this.turb) * (k ? 0.6 : 1);
          const x0 = CX - hw - 8;
          const x1 = CX + hw + 8;
          for (let x = x0; x <= x1; x += 7) {
            const y =
              mid +
              amp * Math.sin(x * 0.045 + this.time * (3.1 + k) + idx * 1.7 + k * 2.1) +
              amp * 0.45 * Math.sin(x * 0.12 - this.time * 4.4 + idx);
            if (x === x0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });
    }

    ctx.globalAlpha = 1;
    ctx.restore();
    }

    // 染料团（倒入的新颜色在液体中翻滚扩散）：半径受杯壁与液面约束，无需裁剪
    if (this.blobs.length) {
      for (const b of this.blobs) {
        const t = b.life / b.max;
        const wall = cavityHalfWidth(g, b.y) - Math.abs(b.x - CX);
        const r = Math.min(3 + 17 * Math.sqrt(t), wall * 1.15, (b.y - L) * 1.2 + 2, g.bottomY - b.y + 6);
        if (r < 1.5) continue;
        ctx.globalAlpha = 0.55 * Math.pow(1 - t, 1.3);
        ctx.drawImage(this.blobSprite(b.rgb), b.x - r, b.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // 顶面（透视椭圆），颜色取最上层并提亮
    const top = new Path2D();
    top.moveTo(fx[0], by[0]);
    for (let i = 1; i <= N; i += 1) top.lineTo(fx[i], by[i]);
    for (let i = N; i >= 0; i -= 1) top.lineTo(fx[i], fy[i]);
    top.closePath();
    const topRgb = hexToRgb(mixHexColors(topColor, '#FFF8E7', 0.22));
    const topGrad = ctx.createLinearGradient(CX - hw, 0, CX + hw, 0);
    topGrad.addColorStop(0, rgba(topRgb, topAlpha * 0.75));
    topGrad.addColorStop(0.35, rgba(hexToRgb(mixHexColors(topColor, '#FFFFFF', 0.38)), topAlpha * 0.9));
    topGrad.addColorStop(1, rgba(topRgb, topAlpha * 0.7));
    ctx.fillStyle = topGrad;
    ctx.fill(top);

    // 弯月面高光：前沿亮线 + 后沿弱线
    const fl = new Path2D();
    const bl = new Path2D();
    fl.moveTo(fx[0], fy[0]);
    bl.moveTo(fx[0], by[0]);
    for (let i = 1; i <= N; i += 1) {
      fl.lineTo(fx[i], fy[i]);
      bl.lineTo(fx[i], by[i]);
    }
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.stroke(fl);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke(bl);
  }

  private drawStream() {
    const st = this.stream;
    if (!st) return;
    const ctx = this.ctx;
    const top = Math.max(-6, st.tail ?? -6);
    const bottom = st.head;
    if (bottom - top < 1) return;
    const len = bottom - top;
    const steps = Math.max(4, Math.ceil(len / 8));
    const path = new Path2D();
    const right: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const y = top + (len * i) / steps;
      // 下落加速 → 越往下越细；顶端从画面外的瓶口逐渐成形；表面张力带来轻微摆动
      const fall = clamp((y + 6) / 200, 0, 1);
      const emerge = clamp((y + 6) / 30, 0, 1);
      const w =
        (7.2 - 3.2 * Math.sqrt(fall)) *
        (0.35 + 0.65 * emerge * emerge * (3 - 2 * emerge)) *
        (1 + 0.07 * Math.sin(this.time * 31 + y * 0.3));
      const x = CX + Math.sin(y * 0.085 - this.time * 13) * 0.75 * fall;
      if (i === 0) path.moveTo(x - w / 2, y);
      else path.lineTo(x - w / 2, y);
      right.push(x + w / 2, y);
    }
    for (let i = right.length - 2; i >= 0; i -= 2) path.lineTo(right[i], right[i + 1]);
    path.closePath();

    const sg = ctx.createLinearGradient(CX - 3.6, 0, CX + 3.6, 0);
    sg.addColorStop(0, rgba(st.rgb, 0.8));
    sg.addColorStop(0.4, rgba(st.glow, 0.96));
    sg.addColorStop(0.62, rgba(st.rgb, 0.92));
    sg.addColorStop(1, rgba(st.rgb, 0.72));
    ctx.fillStyle = sg;
    ctx.fill(path);

    // 中心高光：沿液柱向下流动的亮段
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    const phase = (this.time * 140) % 12;
    for (let y = top + 18 - 12 + phase; y < bottom - 2; y += 12) {
      ctx.fillRect(CX - 1.4, Math.max(top + 18, y), 0.8, 6);
    }
  }
}
