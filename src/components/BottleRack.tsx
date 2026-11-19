import React, { useEffect, useRef, useState } from 'react';
import { APP_CONFIG } from '../config';
import { INGREDIENTS } from '../data/ingredients';
import { Ingredient, IngredientCategory, PourEntry } from '../types';

interface BottleRackProps {
  pours: PourEntry[];
  totalMl: number;
  pouringId: string | null;
  onPourDelta: (ingredient: Ingredient, deltaMl: number) => void;
  onPourStateChange: (ingredient: Ingredient | null) => void;
}

const CATEGORIES: Array<{ id: 'all' | IngredientCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'spirit', label: '基酒' },
  { id: 'liqueur_juice', label: '利口/果汁' },
  { id: 'mixer_syrup', label: '气泡/糖浆' },
];

const BottleSilhouette: React.FC<{ ingredient: Ingredient; active: boolean }> = ({
  ingredient,
  active,
}) => {
  const { bottleShape, color, glowColor } = ingredient;

  return (
    <svg
      viewBox="0 0 36 44"
      className={`w-7 h-9 shrink-0 transition-transform duration-200 ${
        active ? '-rotate-[28deg] scale-110' : ''
      }`}
      aria-hidden="true"
    >
      {bottleShape === 'can' ? (
        <>
          <rect x="9" y="8" width="18" height="30" rx="4" fill="#2A1D18" stroke="#C89B54" strokeWidth="1.2" />
          <rect x="11" y="13" width="14" height="22" rx="2" fill={color} opacity="0.88" />
          <line x1="13" y1="15" x2="13" y2="32" stroke={glowColor} strokeWidth="1.6" opacity="0.7" />
          <rect x="12" y="5" width="12" height="3" rx="1" fill="#C89B54" />
        </>
      ) : bottleShape === 'stout' ? (
        <>
          <rect x="14" y="4" width="8" height="7" rx="1.5" fill="#C89B54" />
          <path
            d="M 14 11 L 9 17 L 9 37 Q 9 40 12 40 L 24 40 Q 27 40 27 37 L 27 17 L 22 11 Z"
            fill="#241712"
            stroke="#C89B54"
            strokeWidth="1.2"
          />
          <path d="M 11 20 L 25 20 L 25 38 L 11 38 Z" fill={color} opacity="0.9" />
          <line x1="13" y1="21" x2="13" y2="35" stroke={glowColor} strokeWidth="1.6" opacity="0.65" />
        </>
      ) : bottleShape === 'flask' ? (
        <>
          <rect x="15" y="4" width="6" height="8" rx="1.5" fill="#C89B54" />
          <circle cx="18" cy="27" r="11.5" fill="#241712" stroke="#C89B54" strokeWidth="1.2" />
          <path d="M 8 27 A 10 10 0 0 0 28 27 Z" fill={color} opacity="0.92" />
          <circle cx="18" cy="27" r="9.5" fill={color} opacity="0.45" />
          <path d="M 12 22 Q 14 19 17 19" stroke={glowColor} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : bottleShape === 'syrup' ? (
        <>
          <rect x="15" y="4" width="6" height="9" rx="1" fill="#C89B54" />
          <path
            d="M 15 13 L 10 21 L 10 38 Q 10 40 12 40 L 24 40 Q 26 40 26 38 L 26 21 L 21 13 Z"
            fill="#241712"
            stroke="#C89B54"
            strokeWidth="1.2"
          />
          <path d="M 11.5 22 L 24.5 22 L 24.5 38 L 11.5 38 Z" fill={color} opacity="0.94" />
          <line x1="14" y1="23" x2="14" y2="36" stroke={glowColor} strokeWidth="1.5" opacity="0.65" />
        </>
      ) : (
        <>
          <rect x="15" y="3" width="6" height="10" rx="1.2" fill="#C89B54" />
          <path
            d="M 15 13 L 11 19 L 11 38 Q 11 40 13 40 L 23 40 Q 25 40 25 38 L 25 19 L 21 13 Z"
            fill="#241712"
            stroke="#C89B54"
            strokeWidth="1.2"
          />
          <rect x="12.5" y="21" width="11" height="17" rx="1" fill={color} opacity="0.88" />
          <line x1="14.5" y1="22" x2="14.5" y2="36" stroke={glowColor} strokeWidth="1.5" opacity="0.65" />
        </>
      )}
    </svg>
  );
};

export const BottleRack: React.FC<BottleRackProps> = ({
  pours,
  totalMl,
  pouringId,
  onPourDelta,
  onPourStateChange,
}) => {
  const [category, setCategory] = useState<'all' | IngredientCategory>('all');
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);
  const activeIngRef = useRef<Ingredient | null>(null);

  const filtered =
    category === 'all' ? INGREDIENTS : INGREDIENTS.filter((i) => i.category === category);

  const pouredMap = new Map<string, number>();
  pours.forEach((p) => {
    pouredMap.set(p.ingredientId, (pouredMap.get(p.ingredientId) ?? 0) + p.ml);
  });

  const stopHolding = (triggerTapIfShort: boolean) => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }

    const ing = activeIngRef.current;
    const wasHolding = isHoldingRef.current;
    isHoldingRef.current = false;
    activeIngRef.current = null;

    if (ing && triggerTapIfShort && !wasHolding) {
      onPourDelta(ing, APP_CONFIG.tapPourMl);
      onPourStateChange(ing);
      window.setTimeout(() => {
        onPourStateChange(null);
      }, 260);
    } else {
      onPourStateChange(null);
    }
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    };
  }, []);

  const handlePointerDown = (ing: Ingredient, e: React.PointerEvent) => {
    e.preventDefault();
    if (totalMl >= APP_CONFIG.maxGlassMl) return;
    stopHolding(false);
    activeIngRef.current = ing;
    isHoldingRef.current = false;

    holdTimerRef.current = window.setTimeout(() => {
      isHoldingRef.current = true;
      onPourStateChange(ing);
      onPourDelta(ing, APP_CONFIG.holdPourStepMl);
      holdIntervalRef.current = window.setInterval(() => {
        onPourDelta(ing, APP_CONFIG.holdPourStepMl);
      }, APP_CONFIG.holdPourIntervalMs);
    }, 180);
  };

  const isFull = totalMl >= APP_CONFIG.maxGlassMl;

  return (
    <div className="flex flex-col gap-2">
      {/* 分类切换 + 提示 */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-2 py-1 rounded-full text-[10.5px] font-medium whitespace-nowrap transition ${
                  active
                    ? 'bg-[#8F1D2C] text-[#F5EBD6] border border-[#E5A93C]/50 shadow-sm'
                    : 'bg-[#1D130F] text-[#B8A690] border border-[#C89B54]/20 hover:text-[#F5EBD6]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        <span className="text-[9.5px] text-[#C89B54] whitespace-nowrap shrink-0">
          {isFull ? '已满杯' : '轻点/长按倒酒'}
        </span>
      </div>

      {/* 酒瓶横向/两行滑架 */}
      <div className="grid grid-cols-2 gap-1.5 max-h-[156px] overflow-y-auto no-scrollbar pr-0.5">
        {filtered.map((ing) => {
          const addedMl = pouredMap.get(ing.id) ?? 0;
          const isPouring = pouringId === ing.id;
          return (
            <button
              key={ing.id}
              type="button"
              data-testid={`bottle-${ing.id}`}
              disabled={isFull}
              onPointerDown={(e) => handlePointerDown(ing, e)}
              onPointerUp={() => stopHolding(true)}
              onPointerLeave={() => stopHolding(false)}
              onPointerCancel={() => stopHolding(false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`group relative flex items-center gap-2 p-2 rounded-xl text-left border transition-all touch-none ${
                isPouring
                  ? 'bg-[#2C1B15] border-[#E5A93C] shadow-[0_0_16px_rgba(229,169,60,0.3)] scale-[0.98]'
                  : addedMl > 0
                  ? 'bg-[#231510] border-[#C89B54]/55 hover:border-[#E5A93C]/70'
                  : 'bg-[#18100C] border-[#C89B54]/20 hover:border-[#C89B54]/45'
              } ${isFull ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.97]'}`}
            >
              <BottleSilhouette ingredient={ing} active={isPouring} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-[#F5EBD6] truncate">
                    {ing.name}
                  </span>
                  {addedMl > 0 && (
                    <span className="font-mono-tech text-[10px] px-1 py-0.2 rounded bg-[#8F1D2C]/80 text-[#F5EBD6] shrink-0">
                      {addedMl}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="font-mono-tech text-[9px] text-[#E5A93C]">
                    {ing.abv > 0 ? `${ing.abv}°` : '0°'}
                  </span>
                  {ing.carbonated && (
                    <span className="text-[9px] text-[#7DD3FC]">气泡</span>
                  )}
                  <span className="text-[9.5px] text-[#A89680] truncate">{ing.shortNote}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
