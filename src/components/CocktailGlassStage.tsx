import React, { useEffect, useMemo, useRef } from 'react';
import { APP_CONFIG } from '../config';
import { GLASS_MAP } from '../data/glasses';
import {
  computeBlendedColor,
  computeLiquidLayers,
  hasCarbonatedIngredient,
  mixHexColors,
} from '../engine/flavorEngine';
import { GarnishId, GlassId, IceType, Ingredient, PourEntry } from '../types';

interface CocktailGlassStageProps {
  glassId: GlassId;
  iceType: IceType;
  garnishes: GarnishId[];
  pours: PourEntry[];
  abv: number;
  totalMl: number;
  shakeProgress: number; // 0 - 100
  isShaking: boolean;
  pouringIngredient: Ingredient | null;
  onUndoPour: () => void;
  onClearGlass: () => void;
}

interface GlassGeometry {
  cavityPath: string;
  topY: number;
  bottomY: number;
  rimLeftX: number;
  rimRightX: number;
  rimY: number;
  baseWidth: number;
}

const GEOMETRY: Record<GlassId, GlassGeometry> = {
  martini: {
    cavityPath: 'M 42 54 L 198 54 L 125 148 L 115 148 Z',
    topY: 54,
    bottomY: 148,
    rimLeftX: 42,
    rimRightX: 198,
    rimY: 54,
    baseWidth: 156,
  },
  rocks: {
    cavityPath: 'M 58 84 L 182 84 L 172 214 L 68 214 Z',
    topY: 84,
    bottomY: 214,
    rimLeftX: 58,
    rimRightX: 182,
    rimY: 84,
    baseWidth: 124,
  },
  highball: {
    cavityPath: 'M 74 44 L 166 44 L 158 220 L 82 220 Z',
    topY: 44,
    bottomY: 220,
    rimLeftX: 74,
    rimRightX: 166,
    rimY: 44,
    baseWidth: 92,
  },
};

interface BubbleParticle {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  alpha: number;
}

export const CocktailGlassStage: React.FC<CocktailGlassStageProps> = ({
  glassId,
  iceType,
  garnishes,
  pours,
  abv,
  totalMl,
  shakeProgress,
  isShaking,
  pouringIngredient,
  onUndoPour,
  onClearGlass,
}) => {
  const geo = GEOMETRY[glassId];
  const layers = useMemo(() => computeLiquidLayers(pours), [pours]);
  const blendedColor = useMemo(() => computeBlendedColor(pours), [pours]);
  const hasBubbles = useMemo(() => hasCarbonatedIngredient(pours), [pours]);
  const fillRatio = Math.min(0.92, totalMl / APP_CONFIG.maxGlassMl);
  const cavityHeight = geo.bottomY - geo.topY;
  const liquidHeight = cavityHeight * fillRatio;
  const liquidTopY = geo.bottomY - liquidHeight;

  // 计算液面在当前高度处的近似宽度（马天尼杯上宽下窄）
  const surfaceHalfWidth = useMemo(() => {
    if (glassId === 'martini') {
      return 6 + 72 * fillRatio;
    }
    if (glassId === 'rocks') {
      return 52 + 10 * fillRatio;
    }
    return 38 + 8 * fillRatio;
  }, [glassId, fillRatio]);

  // 摇晃进度 0~100 将各分层色彩平滑插值到融合色
  const mixFactor = Math.min(1, shakeProgress / 100);
  const gradientStops = useMemo(() => {
    if (layers.length === 0) {
      return [
        { offset: '0%', color: '#E5A93C', opacity: 0 },
        { offset: '100%', color: '#E5A93C', opacity: 0 },
      ];
    }
    if (layers.length === 1) {
      const c = layers[0].color;
      return [
        { offset: '0%', color: mixHexColors(c, '#120B08', 0.2), opacity: Math.min(0.95, layers[0].opacity + 0.12) },
        { offset: '60%', color: c, opacity: Math.min(0.94, layers[0].opacity + 0.08) },
        { offset: '100%', color: mixHexColors(c, '#FFF8E7', 0.2), opacity: Math.min(0.9, layers[0].opacity + 0.04) },
      ];
    }

    const stops: Array<{ offset: string; color: string; opacity: number }> = [];
    let acc = 0;
    layers.forEach((layer, idx) => {
      const start = acc;
      const mid = acc + layer.ratio * 0.5;
      const end = acc + layer.ratio;
      const currentColor = mixHexColors(layer.color, blendedColor, mixFactor);
      const op = Math.min(0.95, Math.max(0.56, layer.opacity + 0.12));

      if (idx === 0) {
        stops.push({ offset: '0%', color: mixHexColors(currentColor, '#120B08', 0.14), opacity: op });
      } else {
        stops.push({ offset: `${(start * 100).toFixed(1)}%`, color: currentColor, opacity: op });
      }
      stops.push({ offset: `${(mid * 100).toFixed(1)}%`, color: currentColor, opacity: op });
      if (idx === layers.length - 1) {
        stops.push({
          offset: `${Math.min(100, end * 100).toFixed(1)}%`,
          color: mixHexColors(currentColor, '#FFF8E7', 0.14),
          opacity: op,
        });
      }
      acc = end;
    });
    return stops;
  }, [layers, blendedColor, mixFactor]);

  // 60fps Canvas 碳酸气泡粒子动画
  const bubbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleStateRef = useRef({
    hasBubbles,
    fillRatio,
    liquidTopY,
    bottomY: geo.bottomY,
    glassId,
    isShaking,
    pouring: Boolean(pouringIngredient),
  });

  useEffect(() => {
    bubbleStateRef.current = {
      hasBubbles,
      fillRatio,
      liquidTopY,
      bottomY: geo.bottomY,
      glassId,
      isShaking,
      pouring: Boolean(pouringIngredient),
    };
  }, [hasBubbles, fillRatio, liquidTopY, geo.bottomY, glassId, isShaking, pouringIngredient]);

  useEffect(() => {
    const canvas = bubbleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 240;
    const H = 260;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: BubbleParticle[] = Array.from({ length: 34 }, (_, i) => ({
      x: 120 + (Math.random() - 0.5) * 70,
      y: 120 + (i / 34) * 100,
      r: 1.1 + Math.random() * 2.1,
      vy: 0.45 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.5,
    }));

    let rafId = 0;
    let tick = 0;

    const render = () => {
      tick += 0.05;
      ctx.clearRect(0, 0, W, H);
      const st = bubbleStateRef.current;

      if (st.fillRatio > 0.04 && (st.hasBubbles || st.pouring || st.isShaking)) {
        const count = st.hasBubbles ? particles.length : 12;
        const speedMul = st.isShaking ? 2.4 : st.pouring ? 1.7 : 1;

        for (let i = 0; i < count; i += 1) {
          const p = particles[i];
          p.y -= p.vy * speedMul;
          const progressFromBottom = Math.max(
            0,
            Math.min(1, (st.bottomY - p.y) / Math.max(10, st.bottomY - st.liquidTopY))
          );

          // 约束水平范围在当前杯型的内部宽度里
          let maxHalfW = 34;
          if (st.glassId === 'martini') {
            maxHalfW = 6 + 60 * st.fillRatio * progressFromBottom;
          } else if (st.glassId === 'rocks') {
            maxHalfW = 48;
          } else {
            maxHalfW = 34;
          }

          if (p.y < st.liquidTopY + 3 || p.y > st.bottomY - 2) {
            p.y = st.bottomY - 4 - Math.random() * 14;
            p.x = 120 + (Math.random() - 0.5) * Math.max(12, maxHalfW * 1.5);
          }

          const drawX = Math.max(
            120 - maxHalfW,
            Math.min(120 + maxHalfW, p.x + Math.sin(tick + p.phase) * 1.4)
          );

          ctx.beginPath();
          ctx.arc(drawX, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 250, 238, ${p.alpha})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(drawX - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const auraColor = totalMl > 0 ? blendedColor : '#E5A93C';
  const glassMeta = GLASS_MAP[glassId];

  return (
    <div className="relative flex-1 min-h-0 flex items-center justify-center px-3 py-1 overflow-hidden">
      {/* 氛围霓虹背光晕染 */}
      <div
        className="pointer-events-none absolute w-56 h-56 rounded-full blur-3xl transition-colors duration-700"
        style={{
          background: `radial-gradient(circle, ${auraColor}44 0%, ${auraColor}12 52%, transparent 75%)`,
        }}
      />

      {/* 左侧复古读数与刻度柱 */}
      <div className="absolute left-3 top-2 bottom-2 flex flex-col justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono-tech text-[9px] tracking-[0.18em] text-[#C89B54]/80 uppercase">
            EST. ABV
          </span>
          <span
            data-testid="live-abv"
            className="font-editorial text-xl font-bold text-[#F5EBD6] leading-none neon-amber-text"
          >
            {abv.toFixed(1)}
            <span className="text-xs text-[#E5A93C] ml-0.5">%</span>
          </span>
        </div>

        <div className="flex flex-col gap-1 my-auto">
          <div className="h-24 w-[2px] bg-[#C89B54]/20 relative rounded-full overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#8F1D2C] via-[#E5A93C] to-[#F5EBD6] transition-all duration-300"
              style={{ height: `${Math.min(100, (totalMl / APP_CONFIG.maxGlassMl) * 100)}%` }}
            />
          </div>
          <span data-testid="live-ml" className="font-mono-tech text-[10px] text-[#C7B69C]">
            {totalMl}
            <span className="text-[#8A745C]">/{APP_CONFIG.maxGlassMl}ml</span>
          </span>
        </div>

        <div className="text-[10px] text-[#C7B69C]/75 tracking-wide">
          {glassMeta?.name}
        </div>
      </div>

      {/* 右侧配方层小胶囊 & 撤销/重置操作 */}
      <div className="absolute right-3 top-2 bottom-2 flex flex-col justify-between items-end z-10">
        <div className="flex items-center gap-1.5">
          {totalMl > 0 && (
            <>
              <button
                type="button"
                onClick={onUndoPour}
                aria-label="撤销上一倒"
                className="px-2 py-1 rounded-full text-[10px] font-medium bg-[#1C120E]/90 border border-[#C89B54]/30 text-[#C7B69C] hover:text-[#F5EBD6] active:scale-95 transition"
              >
                撤销
              </button>
              <button
                type="button"
                onClick={onClearGlass}
                aria-label="清空酒杯"
                className="px-2 py-1 rounded-full text-[10px] font-medium bg-[#2C1317]/90 border border-[#8F1D2C]/50 text-[#F2B5BD] hover:text-white active:scale-95 transition"
              >
                倒掉
              </button>
            </>
          )}
        </div>

        {/* 当前原料色点清单 */}
        <div className="flex flex-col items-end gap-1 max-w-[104px] pointer-events-none">
          {layers
            .slice()
            .reverse()
            .slice(0, 5)
            .map((layer) => (
              <div
                key={layer.ingredientId}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#160E0B]/80 border border-[#C89B54]/20"
              >
                <span className="text-[10px] text-[#E6D9C3] truncate max-w-[60px]">
                  {layer.name.replace(/伦敦干|古巴|冰川|波本|意式|鲜榨|红宝石|鲜甜日落|奎宁|冰镇|精酿黑/, '')}
                </span>
                <span className="font-mono-tech text-[9px] text-[#C89B54]">{layer.ml}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0 border border-white/30"
                  style={{ backgroundColor: layer.color }}
                />
              </div>
            ))}
          {layers.length > 5 && (
            <span className="text-[9px] text-[#C89B54]">+{layers.length - 5} 种原料</span>
          )}
        </div>

        <div className="pointer-events-none flex items-center gap-1">
          {hasBubbles && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#162730]/80 border border-[#72C8E8]/40 text-[#A8E5FA]">
              ✦ 气泡激活
            </span>
          )}
        </div>
      </div>

      {/* 倾倒提示浮标 */}
      {pouringIngredient && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-[#1C120E]/95 border border-[#E5A93C]/60 shadow-lg flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: pouringIngredient.color }}
          />
          <span className="text-[11px] font-medium text-[#F5EBD6]">
            倾倒 {pouringIngredient.name}
          </span>
        </div>
      )}

      {/* 核心酒杯 SVG + Canvas 气泡舞台 */}
      <div
        data-testid="glass-stage-container"
        className={`relative w-[224px] h-[242px] sm:w-[240px] sm:h-[260px] flex items-center justify-center transition-transform duration-200 ${
          isShaking ? 'animate-cocktail-shake' : ''
        }`}
      >
        <svg
          viewBox="0 0 240 260"
          className="w-full h-full overflow-visible drop-shadow-[0_14px_24px_rgba(0,0,0,0.65)]"
          aria-label={`${glassMeta?.name}调酒舞台`}
        >
          <defs>
            <clipPath id={`clip-${glassId}`}>
              <path d={geo.cavityPath} />
            </clipPath>

            {/* 液体密度分层平滑渐变（杯底 y2 -> 液面 y1） */}
            <linearGradient
              id="cocktailLiquidGrad"
              x1="0%"
              y1="100%"
              x2="0%"
              y2="0%"
            >
              {gradientStops.map((s, idx) => (
                <stop
                  key={`${idx}-${s.offset}`}
                  offset={s.offset}
                  stopColor={s.color}
                  stopOpacity={s.opacity}
                />
              ))}
            </linearGradient>

            {/* 玻璃质感高光渐变 */}
            <linearGradient id="glassSheen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
              <stop offset="22%" stopColor="#FFFFFF" stopOpacity="0.06" />
              <stop offset="78%" stopColor="#FFFFFF" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#F5EBD6" stopOpacity="0.2" />
            </linearGradient>

            <radialGradient id="sphereIceGrad" cx="35%" cy="32%" r="65%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.62" />
              <stop offset="65%" stopColor="#D6F0FF" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.38" />
            </radialGradient>
          </defs>

          {/* 吧台桌面倒影椭盘 */}
          <ellipse cx="120" cy="242" rx="64" ry="8" fill="#000000" opacity="0.48" />
          <ellipse cx="120" cy="242" rx="46" ry="4" fill={auraColor} opacity="0.16" />

          {/* 后置杯口装饰物：柠檬轮片 / 薄荷 / 迷迭香 */}
          {garnishes.includes('lime') && (
            <g transform={`translate(${geo.rimRightX - 8}, ${geo.rimY + 2})`}>
              <circle r="21" fill="#4D9B2E" stroke="#2D5E19" strokeWidth="1.5" />
              <circle r="17" fill="#D5F483" />
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <line
                  key={deg}
                  x1="0"
                  y1="0"
                  x2={Math.cos((deg * Math.PI) / 180) * 15}
                  y2={Math.sin((deg * Math.PI) / 180) * 15}
                  stroke="#7DC444"
                  strokeWidth="1.8"
                />
              ))}
            </g>
          )}

          {garnishes.includes('mint') && (
            <g transform={`translate(${120 - 24}, ${geo.rimY - 2}) rotate(-18)`}>
              <path
                d="M 0 12 Q -16 -6 -6 -22 Q 6 -12 4 8 Z"
                fill="#358C52"
                stroke="#76D693"
                strokeWidth="0.9"
              />
              <path
                d="M 2 10 Q 18 -8 10 -24 Q -2 -14 -1 6 Z"
                fill="#4BB46E"
                stroke="#92E6AD"
                strokeWidth="0.9"
              />
              <line x1="1" y1="12" x2="2" y2="-16" stroke="#B6F5C9" strokeWidth="0.8" opacity="0.7" />
            </g>
          )}

          {garnishes.includes('rosemary') && (
            <g transform={`translate(${120 + 22}, ${geo.rimY + 10}) rotate(15)`}>
              <line x1="0" y1="36" x2="0" y2="-40" stroke="#537F4C" strokeWidth="2.4" strokeLinecap="round" />
              {[-32, -23, -14, -5, 4, 13].map((y) => (
                <g key={y}>
                  <line x1="0" y1={y} x2="-9" y2={y - 6} stroke="#72A868" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="0" y1={y} x2="9" y2={y - 6} stroke="#629459" strokeWidth="1.8" strokeLinecap="round" />
                </g>
              ))}
            </g>
          )}

          {/* 倾倒液流动画（从顶倾泻至液面） */}
          {pouringIngredient && (
            <g>
              <line
                x1="120"
                y1="2"
                x2="120"
                y2={Math.max(geo.rimY + 6, liquidTopY + 4)}
                stroke={pouringIngredient.color}
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.92"
              />
              <line
                x1="120"
                y1="2"
                x2="120"
                y2={Math.max(geo.rimY + 6, liquidTopY + 4)}
                stroke={pouringIngredient.glowColor}
                strokeWidth="2.2"
                strokeLinecap="round"
                className="animate-pour-stream"
              />
              {totalMl > 0 && (
                <ellipse
                  cx="120"
                  cy={liquidTopY + 1}
                  rx={Math.min(24, surfaceHalfWidth * 0.55)}
                  ry="4"
                  fill="none"
                  stroke={pouringIngredient.glowColor}
                  strokeWidth="1.5"
                  opacity="0.75"
                />
              )}
            </g>
          )}

          {/* 杯腔内部：裁剪区域（液体 + 冰块 + 液面高光） */}
          <g clipPath={`url(#clip-${glassId})`}>
            {/* 微弱玻璃内壁背景 */}
            <path d={geo.cavityPath} fill="url(#glassSheen)" />

            {/* 动态液面（支持高度平滑过渡） */}
            <g
              data-testid="liquid-fill-group"
              data-fill-ratio={fillRatio.toFixed(3)}
              style={{
                transform: `translateY(${liquidTopY}px)`,
                transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {totalMl > 0 && (
                <>
                  <rect
                    x="30"
                    y="0"
                    width="180"
                    height={Math.max(2, liquidHeight + 2)}
                    fill="url(#cocktailLiquidGrad)"
                  />
                  {/* 动态液面起伏波纹 */}
                  <ellipse
                    cx="120"
                    cy="0"
                    rx={surfaceHalfWidth}
                    ry="4.5"
                    fill="#FFFFFF"
                    opacity="0.22"
                  />
                  <ellipse
                    cx="120"
                    cy="1"
                    rx={surfaceHalfWidth * 0.72}
                    ry="2.2"
                    fill="#FFF7E2"
                    opacity="0.25"
                  />
                </>
              )}
            </g>

            {/* 冰块层：方冰 / 大冰球 */}
            {iceType === 'sphere' && (
              <g
                className="animate-gentle-float"
                style={{
                  transform: `translate(120px, ${
                    totalMl > 0
                      ? Math.min(geo.bottomY - 29, Math.max(geo.topY + 34, liquidTopY + 30))
                      : geo.bottomY - 30
                  }px)`,
                  transition: 'transform 320ms ease-out',
                }}
              >
                <circle
                  r={glassId === 'martini' ? 21 : 27}
                  fill="url(#sphereIceGrad)"
                  stroke="rgba(255,255,255,0.58)"
                  strokeWidth="1.2"
                />
                <ellipse cx="-8" cy="-9" rx="7" ry="4" fill="#FFFFFF" opacity="0.52" transform="rotate(-28 -8 -9)" />
              </g>
            )}

            {iceType === 'cubes' && (
              <g
                style={{
                  transform: `translateY(${
                    totalMl > 0
                      ? Math.min(geo.bottomY - 58, Math.max(geo.topY + 14, liquidTopY + 8))
                      : geo.bottomY - 62
                  }px)`,
                  transition: 'transform 320ms ease-out',
                }}
              >
                {[
                  { x: 103, y: 10, rot: -14, s: 23 },
                  { x: 132, y: 20, rot: 16, s: 22 },
                  { x: 116, y: 38, rot: -6, s: 23 },
                ].map((c, idx) => (
                  <g key={idx} transform={`translate(${c.x}, ${c.y}) rotate(${c.rot})`}>
                    <rect
                      x={-c.s / 2}
                      y={-c.s / 2}
                      width={c.s}
                      height={c.s}
                      rx="4.5"
                      fill="rgba(232, 247, 255, 0.28)"
                      stroke="rgba(255, 255, 255, 0.62)"
                      strokeWidth="1.1"
                    />
                    <line
                      x1={-c.s / 2 + 4}
                      y1={-c.s / 2 + 4}
                      x2={c.s / 2 - 5}
                      y2={-c.s / 2 + 4}
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                      opacity="0.55"
                    />
                  </g>
                ))}
              </g>
            )}
          </g>

          {/* 前置装饰物：酒渍红樱桃 & 烟熏橙皮卷 */}
          {garnishes.includes('cherry') && (
            <g transform={`translate(116, ${geo.rimY + 4})`}>
              <line x1="-26" y1="-20" x2="18" y2="24" stroke="#C89B54" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="-2" cy="2" r="9" fill="#B5132B" stroke="#6B0A18" strokeWidth="1" />
              <circle cx="-5" cy="-1" r="2.6" fill="#FFFFFF" opacity="0.58" />
            </g>
          )}

          {garnishes.includes('orange_peel') && (
            <g transform={`translate(${geo.rimLeftX + 18}, ${geo.rimY + 2})`}>
              <path
                d="M -12 4 C -16 -16, 12 -22, 16 -2 C 18 6, 8 10, 4 3"
                fill="none"
                stroke="#F28F22"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M -10 2 C -12 -12, 10 -17, 13 -2"
                fill="none"
                stroke="#FFD185"
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.7"
              />
            </g>
          )}

          {/* 精致水晶杯轮廓与反光高光 */}
          {glassId === 'martini' && (
            <g fill="none" stroke="rgba(245, 235, 214, 0.78)" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M 38 52 L 116 150 L 116 232 M 202 52 L 124 150 L 124 232" />
              <ellipse cx="120" cy="52" rx="82" ry="7.5" strokeOpacity="0.88" />
              <ellipse cx="120" cy="235" rx="40" ry="6" fill="rgba(245,235,214,0.12)" />
              {/* 水晶左侧高光 */}
              <line
                x1="56"
                y1="68"
                x2="100"
                y2="124"
                stroke="#FFFFFF"
                strokeOpacity="0.35"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>
          )}

          {glassId === 'rocks' && (
            <g fill="none" stroke="rgba(245, 235, 214, 0.78)" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M 55 82 L 66 232 L 174 232 L 185 82" />
              {/* 厚重水晶底折射 */}
              <path d="M 67 215 L 173 215 L 174 231 L 66 231 Z" fill="rgba(245, 235, 214, 0.14)" stroke="none" />
              <line x1="68" y1="215" x2="172" y2="215" strokeOpacity="0.45" strokeWidth="1.2" />
              <ellipse cx="120" cy="82" rx="65" ry="6.5" strokeOpacity="0.88" />
              <line
                x1="68"
                y1="100"
                x2="75"
                y2="202"
                stroke="#FFFFFF"
                strokeOpacity="0.34"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>
          )}

          {glassId === 'highball' && (
            <g fill="none" stroke="rgba(245, 235, 214, 0.78)" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M 71 42 L 80 234 L 160 234 L 169 42" />
              <path d="M 80 220 L 160 220 L 160 233 L 80 233 Z" fill="rgba(245, 235, 214, 0.15)" stroke="none" />
              <line x1="81" y1="220" x2="159" y2="220" strokeOpacity="0.45" strokeWidth="1.2" />
              <ellipse cx="120" cy="42" rx="49" ry="5.5" strokeOpacity="0.88" />
              <line
                x1="83"
                y1="62"
                x2="89"
                y2="206"
                stroke="#FFFFFF"
                strokeOpacity="0.34"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>

        {/* 60fps Canvas 碳酸气泡叠加层 */}
        <canvas
          ref={bubbleCanvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
