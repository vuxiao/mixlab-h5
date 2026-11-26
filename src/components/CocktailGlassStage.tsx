import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useArmedConfirm } from '../hooks/useArmedConfirm';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { Presence } from './Presence';
import { APP_CONFIG } from '../config';
import { GLASS_MAP } from '../data/glasses';
import { INGREDIENT_MAP } from '../data/ingredients';
import {
  computeBlendedColor,
  computeLiquidLayers,
  hasCarbonatedIngredient,
} from '../engine/flavorEngine';
import { GLASS_GEOMETRY, LiquidRenderer, LiquidSceneState } from '../engine/liquidRenderer';
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
  /** 被全屏介绍页遮挡时暂停动画 */
  paused?: boolean;
  onUndoPour: () => void;
  onClearGlass: () => void;
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
  paused = false,
  onUndoPour,
  onClearGlass,
}) => {
  const { armedKey, trigger: armConfirm, disarm } = useArmedConfirm(2600);
  const geo = GLASS_GEOMETRY[glassId];
  const layers = useMemo(() => computeLiquidLayers(pours), [pours]);
  const blendedColor = useMemo(() => computeBlendedColor(pours), [pours]);
  const hasBubbles = useMemo(() => hasCarbonatedIngredient(pours), [pours]);
  // 满杯 240/240 时液面贴近杯口（保留 3% 余量避免液面椭圆溢出杯沿）
  const fillRatio = Math.min(1, totalMl / APP_CONFIG.maxGlassMl) * 0.97;
  const cavityHeight = geo.bottomY - geo.topY;
  const liquidTopY = geo.bottomY - cavityHeight * fillRatio;

  const fillRatioDisplayTarget = fillRatio;
  const mix = Math.min(1, shakeProgress / 100);

  // —— 实时液体渲染引擎 ——
  const shakeBoxRef = useRef<HTMLDivElement | null>(null);
  const swapLayerRef = useRef<HTMLDivElement | null>(null);
  const liquidCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<LiquidRenderer | null>(null);
  const [pageHidden, setPageHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );

  useEffect(() => {
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMq = () => setReducedMotion(Boolean(mq?.matches));
    mq?.addEventListener?.('change', onMq);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  const scene: LiquidSceneState = useMemo(
    () => ({
      glassId,
      layers: layers.map((l) => ({
        id: l.ingredientId,
        color: l.color,
        glow: INGREDIENT_MAP[l.ingredientId]?.glowColor ?? l.color,
        opacity: l.opacity,
        ml: l.ml,
        density: l.density,
      })),
      fillRatio: fillRatioDisplayTarget,
      blendedColor,
      mix,
      carbonated: hasBubbles,
      pour: pouringIngredient
        ? {
            color: pouringIngredient.color,
            glow: pouringIngredient.glowColor,
            density: pouringIngredient.density,
          }
        : null,
      shaking: isShaking,
      running: !paused && !pageHidden,
      reducedMotion,
    }),
    [glassId, layers, fillRatioDisplayTarget, blendedColor, mix, hasBubbles, pouringIngredient, isShaking, paused, pageHidden, reducedMotion]
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useLayoutEffect(() => {
    const canvas = liquidCanvasRef.current;
    if (!canvas) return undefined;
    let renderer: LiquidRenderer;
    try {
      renderer = new LiquidRenderer(canvas, shakeBoxRef.current, sceneRef.current);
    } catch {
      return undefined;
    }
    rendererRef.current = renderer;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => renderer.resize()) : null;
    ro?.observe(canvas);
    return () => {
      ro?.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setState(scene);
  }, [scene]);

  // 换杯：整杯以 iOS 弹性曲线轻轻浮现（WAAPI，不触发 React 重渲染）
  const firstGlassRef = useRef(true);
  useEffect(() => {
    if (firstGlassRef.current) {
      firstGlassRef.current = false;
      return;
    }
    if (reducedMotion) return;
    swapLayerRef.current?.animate?.(
      [
        { opacity: 0.35, transform: 'translateY(10px) scale(0.94)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
    );
  }, [glassId, reducedMotion]);

  const displayAbv = useAnimatedNumber(abv, 520);

  const auraColor = totalMl > 0 ? blendedColor : '#E5A93C';
  const glassMeta = GLASS_MAP[glassId];

  return (
    <div
      data-testid="glass-stage"
      className="glass-stage-wrap relative flex-1 min-h-0 flex items-end justify-center px-3 pt-1 pb-3 overflow-hidden"
    >
      {/* 氛围霓虹背光晕染 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-[420px] h-[420px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${auraColor}38 0%, ${auraColor}1c 30%, ${auraColor}08 52%, transparent 70%)`,
          transform: 'translateZ(0)',
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
            {displayAbv.toFixed(1)}
            <span className="text-xs text-[#E5A93C] ml-0.5">%</span>
          </span>
        </div>

        <div className="flex flex-col gap-1 my-auto">
          <div className="h-24 w-[2px] bg-[#C89B54]/20 relative rounded-full overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#8F1D2C] via-[#E5A93C] to-[#F5EBD6] transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
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

      {/* 右侧配方层小胶囊 & 撤销/重置操作（紧凑靠边，避开宽口杯边缘与青柠装饰） */}
      <div className="absolute right-2.5 top-2 bottom-2 flex flex-col justify-between items-end z-10 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          {totalMl > 0 && (
            <div className="flex items-center gap-1 anim-fade-in">
              <button
                type="button"
                data-testid="undo-pour-btn"
                onClick={() => {
                  disarm();
                  onUndoPour();
                }}
                aria-label="撤销上一次倾倒"
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1C120E]/92 border border-[#C89B54]/35 text-[#C7B69C] hover:text-[#F5EBD6] active:scale-95 transition"
              >
                撤销
              </button>
              <button
                type="button"
                data-testid="clear-glass-btn"
                onClick={() => {
                  if (armConfirm('clear')) onClearGlass();
                }}
                aria-label={armedKey === 'clear' ? '再次点击确认倒掉整杯' : '倒掉整杯（需二次确认）'}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border active:scale-95 transition ${
                  armedKey === 'clear'
                    ? 'bg-[#8F1D2C] border-[#F2B5BD] text-white animate-pulse'
                    : 'bg-[#2C1317]/92 border-[#8F1D2C]/55 text-[#F2B5BD] hover:text-white'
                }`}
              >
                {armedKey === 'clear' ? '确认倒掉?' : '倒掉'}
              </button>
            </div>
          )}
        </div>

        {/* 当前原料色点清单（中下偏右，避让高杯口与柠檬片） */}
        <div className="flex flex-col items-end gap-1 max-w-[88px] mt-10 mb-auto">
          {layers
            .slice()
            .reverse()
            .slice(0, 5)
            .map((layer) => (
              <div
                key={layer.ingredientId}
                className="anim-row-in flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#160E0B]/88 border border-[#C89B54]/22 shadow-sm"
              >
                <span className="text-[9.5px] text-[#E6D9C3] truncate max-w-[48px]">
                  {layer.name.replace(/伦敦干|古巴|冰川|波本|意式|鲜榨|红宝石|鲜甜日落|奎宁|冰镇|精酿黑/, '')}
                </span>
                <span className="font-mono-tech text-[8.5px] text-[#C89B54]">{layer.ml}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 border border-white/35"
                  style={{ backgroundColor: layer.color }}
                />
              </div>
            ))}
          {layers.length > 5 && (
            <span className="text-[9px] text-[#C89B54]">+{layers.length - 5} 种</span>
          )}
        </div>

        <div className="flex items-center gap-1">

        </div>
      </div>

      {/* 倾倒提示浮标 */}
      <Presence value={pouringIngredient} exitMs={220}>
        {(ing, closing) => (
          <div
            className={`absolute top-2 left-1/2 z-20 px-3 py-1 rounded-full bg-[#1C120E]/95 border border-[#E5A93C]/60 shadow-lg flex items-center gap-1.5 ${
              closing ? 'anim-chip-out' : 'anim-chip-in'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ing.color }} />
            <span className="text-[11px] font-medium text-[#F5EBD6]">{ing.name}</span>
          </div>
        )}
      </Presence>

      {/* 核心酒杯：背景 SVG → 实时液体 Canvas → 前景 SVG（冰块/装饰/杯身） */}
      <div
        ref={shakeBoxRef}
        data-testid="glass-stage-container"
        className="glass-stage-box relative flex items-center justify-center will-change-transform"
      >
        <div ref={swapLayerRef} className="absolute inset-0">
          <svg
            viewBox="0 0 240 260"
            className="absolute inset-0 w-full h-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`clip-back-${glassId}`}>
                <path d={geo.cavityPath} />
              </clipPath>
            {/* 玻璃质感高光渐变 */}
            <linearGradient id="glassSheen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
              <stop offset="22%" stopColor="#FFFFFF" stopOpacity="0.06" />
              <stop offset="78%" stopColor="#FFFFFF" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#F5EBD6" stopOpacity="0.2" />
            </linearGradient>

            {/* 复古胡桃木吧台台面光晕渐变 */}
            <linearGradient id="barCounterSurface" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3B2418" stopOpacity="0.58" />
              <stop offset="45%" stopColor="#1D110C" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#0E0806" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="brassCoasterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6D4B22" />
              <stop offset="35%" stopColor="#D9AE62" />
              <stop offset="55%" stopColor="#F2D28B" />
              <stop offset="100%" stopColor="#6D4B22" />
            </linearGradient>
            </defs>

          {/* 复古胡桃木吧台台面弧线与反光 */}
          <g aria-hidden="true">
            <path
              d="M -45 232 Q 120 218 285 232 L 285 270 L -45 270 Z"
              fill="url(#barCounterSurface)"
            />
            <path
              d="M -38 232 Q 120 218 278 232"
              fill="none"
              stroke="#C89B54"
              strokeOpacity="0.34"
              strokeWidth="1.2"
            />
            <path
              d="M 16 234 Q 120 226 224 234"
              fill="none"
              stroke="#F5EBD6"
              strokeOpacity="0.16"
              strokeWidth="0.9"
            />
          </g>

          {/* 雕纹黄铜杯垫（Brass Coaster） */}
          <g aria-hidden="true">
            <ellipse cx="120" cy="242" rx="68" ry="11" fill="#080403" opacity="0.72" />
            <ellipse
              cx="120"
              cy="240"
              rx="62"
              ry="9.5"
              fill="#22140D"
              stroke="url(#brassCoasterGrad)"
              strokeWidth="1.8"
            />
            <ellipse
              cx="120"
              cy="240"
              rx="53"
              ry="7"
              fill="none"
              stroke="#E5A93C"
              strokeOpacity="0.45"
              strokeWidth="0.9"
              strokeDasharray="3 3"
            />
            <ellipse cx="120" cy="239" rx="42" ry="4.5" fill={auraColor} opacity="0.2" />
          </g>

          {/* 后置杯口装饰物：柠檬轮片 / 薄荷 / 迷迭香 */}
          {garnishes.includes('lime') && (
            <g className="animate-garnish-pop">
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
            </g>
          )}

          {garnishes.includes('mint') && (
            <g className="animate-garnish-pop">
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
            </g>
          )}

          {garnishes.includes('rosemary') && (
            <g className="animate-garnish-pop">
            <g transform={`translate(${120 + 22}, ${geo.rimY + 10}) rotate(15)`}>
              <line x1="0" y1="36" x2="0" y2="-40" stroke="#537F4C" strokeWidth="2.4" strokeLinecap="round" />
              {[-32, -23, -14, -5, 4, 13].map((y) => (
                <g key={y}>
                  <line x1="0" y1={y} x2="-9" y2={y - 6} stroke="#72A868" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="0" y1={y} x2="9" y2={y - 6} stroke="#629459" strokeWidth="1.8" strokeLinecap="round" />
                </g>
              ))}
            </g>
            </g>
          )}

            <g clipPath={`url(#clip-back-${glassId})`}>
              <path d={geo.cavityPath} fill="url(#glassSheen)" />
            </g>
          </svg>

          {/* 实时液体渲染层（液面波动/分层融合/液柱/气泡） */}
          <canvas
            ref={liquidCanvasRef}
            data-testid="liquid-canvas"
            className="pointer-events-none absolute inset-0 w-full h-full [transform:translateZ(0)]"
            aria-hidden="true"
          />

          <svg
            viewBox="0 0 240 260"
            className="absolute inset-0 w-full h-full overflow-visible"
            role="img"
            aria-label={`${glassMeta?.name}，已倒入 ${totalMl} 毫升`}
          >
            <defs>
              <clipPath id={`clip-${glassId}`}>
                <path d={geo.cavityPath} />
              </clipPath>
            {/* 手凿水晶大冰球高透折射渐变 */}
            <radialGradient id="sphereIceGrad" cx="32%" cy="28%" r="68%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
              <stop offset="32%" stopColor="#E6F7FF" stopOpacity="0.52" />
              <stop offset="70%" stopColor="#A9D8F2" stopOpacity="0.28" />
              <stop offset="92%" stopColor="#FFFFFF" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#D7EEFF" stopOpacity="0.72" />
            </radialGradient>

            </defs>

            {/* 自动化验收钩子：目标液面比例 */}
            <g data-testid="liquid-fill-group" data-fill-ratio={fillRatio.toFixed(3)} />

            <g clipPath={`url(#clip-${glassId})`}>
            {/* 冰块层：匠人大冰球（外层专职定位平移，内层专职漂浮动画，彻底修复 transform 冲突） */}
            {iceType === 'sphere' && (() => {
              const sphereR = glassId === 'martini' ? 23 : 29;
              const targetY =
                totalMl > 0
                  ? Math.min(geo.bottomY - sphereR - 4, Math.max(geo.topY + sphereR + 5, liquidTopY + sphereR + 2))
                  : geo.bottomY - sphereR - 5;
              return (
                <g
                  data-testid="ice-sphere-outer"
                  style={{
                    transform: `translate(120px, ${targetY}px)`,
                    transition: 'transform 320ms ease-out',
                  }}
                >
                  <g key={`drop-${glassId}`} className="animate-ice-drop">
                  <g data-testid="ice-sphere-inner" className="animate-gentle-float">
                    {/* 冰球主体冷白通透基底 */}
                    <circle
                      data-testid="ice-sphere-circle"
                      r={sphereR}
                      fill="url(#sphereIceGrad)"
                      stroke="rgba(240, 250, 255, 0.88)"
                      strokeWidth="1.6"
                    />
                    {/* 内环折射暗边，增强在空杯与浅色液中的立体存在感 */}
                    <circle
                      r={sphereR - 2.2}
                      fill="none"
                      stroke="rgba(180, 224, 248, 0.45)"
                      strokeWidth="1.2"
                    />
                    {/* 左上手凿弧形镜面高光 */}
                    <path
                      d={`M ${(-sphereR * 0.54).toFixed(1)} ${(-sphereR * 0.22).toFixed(1)} A ${(sphereR * 0.66).toFixed(1)} ${(sphereR * 0.66).toFixed(1)} 0 0 1 ${(sphereR * 0.16).toFixed(1)} ${(-sphereR * 0.64).toFixed(1)}`}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      opacity="0.88"
                    />
                    <circle
                      cx={-sphereR * 0.34}
                      cy={-sphereR * 0.36}
                      r={sphereR * 0.13}
                      fill="#FFFFFF"
                      opacity="0.72"
                    />
                    {/* 内部手凿微冰裂折射纹 */}
                    <path
                      d={`M ${(-sphereR * 0.35).toFixed(1)} ${(sphereR * 0.1).toFixed(1)} L ${(-sphereR * 0.04).toFixed(1)} ${(-sphereR * 0.12).toFixed(1)} L ${(sphereR * 0.32).toFixed(1)} ${(sphereR * 0.04).toFixed(1)}`}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1"
                      strokeLinecap="round"
                      opacity="0.48"
                    />
                    <path
                      d={`M ${(-sphereR * 0.14).toFixed(1)} ${(sphereR * 0.36).toFixed(1)} L ${(sphereR * 0.16).toFixed(1)} ${(sphereR * 0.12).toFixed(1)}`}
                      fill="none"
                      stroke="#DDF3FF"
                      strokeWidth="0.9"
                      strokeLinecap="round"
                      opacity="0.44"
                    />
                    {/* 右下底部反折射弧光 */}
                    <path
                      d={`M ${(sphereR * 0.18).toFixed(1)} ${(sphereR * 0.58).toFixed(1)} A ${(sphereR * 0.64).toFixed(1)} ${(sphereR * 0.64).toFixed(1)} 0 0 0 ${(sphereR * 0.58).toFixed(1)} ${(sphereR * 0.14).toFixed(1)}`}
                      fill="none"
                      stroke="#EBF9FF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      opacity="0.6"
                    />
                  </g>
                  </g>
                </g>
              );
            })()}

            {iceType === 'cubes' && (
              <g
                data-testid="ice-cubes-group"
                style={{
                  transform: `translateY(${
                    totalMl > 0
                      ? Math.min(geo.bottomY - 58, Math.max(geo.topY + 14, liquidTopY + 8))
                      : geo.bottomY - 62
                  }px)`,
                  transition: 'transform 320ms ease-out',
                }}
              >
                <g key={`drop-${glassId}`} className="animate-ice-drop">
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
                      fill="rgba(232, 247, 255, 0.34)"
                      stroke="rgba(255, 255, 255, 0.76)"
                      strokeWidth="1.2"
                    />
                    <line
                      x1={-c.s / 2 + 4}
                      y1={-c.s / 2 + 4}
                      x2={c.s / 2 - 5}
                      y2={-c.s / 2 + 4}
                      stroke="#FFFFFF"
                      strokeWidth="1.4"
                      opacity="0.7"
                    />
                    <line
                      x1={-c.s / 2 + 5}
                      y1={c.s / 2 - 5}
                      x2={c.s / 2 - 6}
                      y2={-c.s / 2 + 6}
                      stroke="#EBF8FF"
                      strokeWidth="0.9"
                      opacity="0.38"
                    />
                  </g>
                ))}
                </g>
              </g>
            )}
            </g>

          {/* 前置装饰物：酒渍红樱桃 & 烟熏橙皮卷 */}
          {garnishes.includes('cherry') && (
            <g className="animate-garnish-pop">
            <g transform={`translate(116, ${geo.rimY + 4})`}>
              <line x1="-26" y1="-20" x2="18" y2="24" stroke="#C89B54" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="-2" cy="2" r="9" fill="#B5132B" stroke="#6B0A18" strokeWidth="1" />
              <circle cx="-5" cy="-1" r="2.6" fill="#FFFFFF" opacity="0.58" />
            </g>
            </g>
          )}

          {garnishes.includes('orange_peel') && (
            <g className="animate-garnish-pop">
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
        </div>
      </div>
    </div>
  );
};
