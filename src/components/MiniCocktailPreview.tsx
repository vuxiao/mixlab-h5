import React, { useId, useMemo } from 'react';
import { APP_CONFIG } from '../config';
import { computeLiquidLayers, mixHexColors } from '../engine/flavorEngine';
import { DrinkEvaluation, GlassId } from '../types';

interface MiniCocktailPreviewProps {
  drink: DrinkEvaluation;
  className?: string;
}

const MINI_GEO: Record<
  GlassId,
  { cavity: string; topY: number; bottomY: number; rimY: number; rimRightX: number; rimLeftX: number }
> = {
  martini: {
    cavity: 'M 20 26 L 100 26 L 63 72 L 57 72 Z',
    topY: 26,
    bottomY: 72,
    rimY: 26,
    rimRightX: 100,
    rimLeftX: 20,
  },
  rocks: {
    cavity: 'M 29 40 L 91 40 L 86 105 L 34 105 Z',
    topY: 40,
    bottomY: 105,
    rimY: 40,
    rimRightX: 91,
    rimLeftX: 29,
  },
  highball: {
    cavity: 'M 37 22 L 83 22 L 79 109 L 41 109 Z',
    topY: 22,
    bottomY: 109,
    rimY: 22,
    rimRightX: 83,
    rimLeftX: 37,
  },
};

export const MiniCocktailPreview: React.FC<MiniCocktailPreviewProps> = ({
  drink,
  className = 'w-20 h-24',
}) => {
  const uid = useId().replace(/:/g, '');
  const geo = MINI_GEO[drink.glassId];
  const layers = useMemo(() => computeLiquidLayers(drink.pours), [drink.pours]);
  const fillRatio = Math.min(0.92, Math.max(0.22, drink.totalMl / APP_CONFIG.maxGlassMl));
  const cavityH = geo.bottomY - geo.topY;
  const liquidH = cavityH * fillRatio;
  const liquidTopY = geo.bottomY - liquidH;

  const stops = useMemo(() => {
    if (drink.shaken || layers.length <= 1) {
      return [
        { offset: '0%', color: mixHexColors(drink.blendedColor, '#120B08', 0.22) },
        { offset: '58%', color: drink.blendedColor },
        { offset: '100%', color: mixHexColors(drink.blendedColor, '#FFF8E7', 0.24) },
      ];
    }
    const list: Array<{ offset: string; color: string }> = [];
    let acc = 0;
    layers.forEach((l, idx) => {
      if (idx === 0) list.push({ offset: '0%', color: l.color });
      list.push({ offset: `${((acc + l.ratio * 0.5) * 100).toFixed(1)}%`, color: l.color });
      acc += l.ratio;
      if (idx === layers.length - 1) list.push({ offset: '100%', color: l.color });
    });
    return list;
  }, [drink.shaken, drink.blendedColor, layers]);

  const clipId = `mini-clip-${uid}`;
  const gradId = `mini-grad-${uid}`;
  const iceGradId = `mini-ice-${uid}`;

  return (
    <div
      data-testid="result-mini-glass"
      className={`relative rounded-xl bg-gradient-to-b from-[#160D0A] to-[#0D0705] border border-[#C89B54]/35 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      {/* 背光微晕 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          background: `radial-gradient(circle at 50% 58%, ${drink.blendedColor}, transparent 70%)`,
        }}
      />

      <svg viewBox="0 0 120 130" className="relative z-10 w-full h-full" aria-label="成品鸡尾酒微缩预览杯">
        <defs>
          <clipPath id={clipId}>
            <path d={geo.cavity} />
          </clipPath>
          <linearGradient id={gradId} x1="0%" y1="100%" x2="0%" y2="0%">
            {stops.map((s, i) => (
              <stop key={`${i}-${s.offset}`} offset={s.offset} stopColor={s.color} stopOpacity="0.93" />
            ))}
          </linearGradient>
          <radialGradient id={iceGradId} cx="32%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
            <stop offset="55%" stopColor="#D6F1FF" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.62" />
          </radialGradient>
        </defs>

        {/* 铜杯垫 */}
        <ellipse cx="60" cy="119" rx="30" ry="4" fill="#2A1A11" stroke="#C89B54" strokeOpacity="0.45" strokeWidth="1" />

        {/* 后置装饰 */}
        {drink.garnishes.includes('lime') && (
          <g transform={`translate(${geo.rimRightX - 4}, ${geo.rimY + 1})`}>
            <circle r="11" fill="#4D9B2E" />
            <circle r="8.5" fill="#D5F483" />
          </g>
        )}
        {drink.garnishes.includes('mint') && (
          <g transform={`translate(48, ${geo.rimY - 1}) rotate(-18)`}>
            <ellipse cx="-4" cy="-5" rx="6" ry="3.2" fill="#3B9B5E" />
            <ellipse cx="4" cy="-7" rx="5.5" ry="2.8" fill="#57C07A" />
          </g>
        )}
        {drink.garnishes.includes('rosemary') && (
          <g transform={`translate(70, ${geo.rimY + 4}) rotate(14)`}>
            <line x1="0" y1="16" x2="0" y2="-18" stroke="#629459" strokeWidth="1.6" />
          </g>
        )}

        {/* 杯腔液体 + 冰块 + 气泡 */}
        <g clipPath={`url(#${clipId})`}>
          <rect x="14" y={liquidTopY} width="92" height={Math.max(2, liquidH + 2)} fill={`url(#${gradId})`} />
          <ellipse cx="60" cy={liquidTopY} rx="34" ry="2.5" fill="#FFFFFF" opacity="0.28" />

          {drink.iceType === 'sphere' && (
            <g
              transform={`translate(60, ${Math.min(
                geo.bottomY - 14,
                Math.max(geo.topY + 16, liquidTopY + 16)
              )})`}
            >
              <circle
                r={drink.glassId === 'martini' ? 11 : 14.5}
                fill={`url(#${iceGradId})`}
                stroke="#FFFFFF"
                strokeOpacity="0.82"
                strokeWidth="1.1"
              />
              <path
                d="M -6 -6 Q -2 -10 4 -7"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.85"
              />
            </g>
          )}

          {drink.iceType === 'cubes' && (
            <g
              transform={`translate(0, ${Math.min(
                geo.bottomY - 30,
                Math.max(geo.topY + 6, liquidTopY + 4)
              )})`}
            >
              <rect
                x="45"
                y="4"
                width="13"
                height="13"
                rx="2.5"
                transform="rotate(-12 51 10)"
                fill="rgba(235,248,255,0.34)"
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="0.9"
              />
              <rect
                x="61"
                y="12"
                width="12"
                height="12"
                rx="2.5"
                transform="rotate(14 67 18)"
                fill="rgba(235,248,255,0.34)"
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="0.9"
              />
            </g>
          )}

          {drink.hasBubbles && (
            <g fill="#FFFFFF" opacity="0.62">
              <circle cx="50" cy={liquidTopY + 10} r="1.3" />
              <circle cx="67" cy={liquidTopY + 18} r="1.6" />
              <circle cx="56" cy={liquidTopY + 26} r="1.1" />
              <circle cx="64" cy={liquidTopY + 8} r="1.2" />
            </g>
          )}
        </g>

        {/* 前置装饰 */}
        {drink.garnishes.includes('cherry') && (
          <g transform={`translate(58, ${geo.rimY + 2})`}>
            <line x1="-13" y1="-10" x2="9" y2="12" stroke="#C89B54" strokeWidth="1.2" />
            <circle cx="-1" cy="1" r="4.5" fill="#BD142C" />
          </g>
        )}
        {drink.garnishes.includes('orange_peel') && (
          <path
            d={`M ${geo.rimLeftX + 6} ${geo.rimY + 2} C ${geo.rimLeftX + 4} ${geo.rimY - 10}, ${
              geo.rimLeftX + 18
            } ${geo.rimY - 12}, ${geo.rimLeftX + 19} ${geo.rimY - 1}`}
            fill="none"
            stroke="#F28F22"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        )}

        {/* 杯型外框 */}
        {drink.glassId === 'martini' && (
          <g fill="none" stroke="rgba(245,235,214,0.85)" strokeWidth="1.5">
            <path d="M 18 25 L 58 73 L 58 115 M 102 25 L 62 73 L 62 115" />
            <ellipse cx="60" cy="25" rx="42" ry="4" />
            <ellipse cx="60" cy="117" rx="20" ry="3.2" fill="rgba(245,235,214,0.14)" />
          </g>
        )}
        {drink.glassId === 'rocks' && (
          <g fill="none" stroke="rgba(245,235,214,0.85)" strokeWidth="1.5">
            <path d="M 27 39 L 33 115 L 87 115 L 93 39" />
            <path d="M 33 106 L 87 106 L 87 115 L 33 115 Z" fill="rgba(245,235,214,0.16)" stroke="none" />
            <ellipse cx="60" cy="39" rx="33" ry="3.5" />
          </g>
        )}
        {drink.glassId === 'highball' && (
          <g fill="none" stroke="rgba(245,235,214,0.85)" strokeWidth="1.5">
            <path d="M 35 21 L 40 116 L 80 116 L 85 21" />
            <path d="M 40 109 L 80 109 L 80 116 L 40 116 Z" fill="rgba(245,235,214,0.16)" stroke="none" />
            <ellipse cx="60" cy="21" rx="25" ry="3" />
          </g>
        )}
      </svg>
    </div>
  );
};
