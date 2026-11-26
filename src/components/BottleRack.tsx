import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { INGREDIENTS } from '../data/ingredients';
import { Ingredient, IngredientCategory, PourEntry } from '../types';

interface BottleRackProps {
  pours: PourEntry[];
  totalMl: number;
  pouringId: string | null;
  /** 返回实际倒入的毫升数（满杯时为 0）；merge=true 表示并入上一次倾倒（同一次长按） */
  onPourDelta: (ingredient: Ingredient, deltaMl: number, merge: boolean) => number;
  onPourStateChange: (ingredient: Ingredient | null) => void;
}

const CATEGORIES: Array<{ id: 'all' | IngredientCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'spirit', label: '基酒' },
  { id: 'liqueur_juice', label: '利口/果汁' },
  { id: 'mixer_syrup', label: '气泡/糖浆' },
];

const HOLD_DELAY_MS = 180;
const MOVE_CANCEL_PX = 8;

interface Gesture {
  ing: Ingredient;
  pointerId: number;
  startX: number;
  startY: number;
  el: HTMLElement;
  moved: boolean;
  holding: boolean;
}

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

interface CardHandlers {
  down: (ing: Ingredient, e: React.PointerEvent<HTMLButtonElement>) => void;
  move: (e: React.PointerEvent<HTMLButtonElement>) => void;
  up: (e: React.PointerEvent<HTMLButtonElement>) => void;
  leave: (e: React.PointerEvent<HTMLButtonElement>) => void;
  cancel: () => void;
  keyTap: (ing: Ingredient) => void;
}

/** 单个酒瓶卡片：memo 化，倒酒时只有被倒的那瓶重新渲染 */
const BottleCard = React.memo(function BottleCard({
  ing,
  addedMl,
  isPouring,
  isFull,
  h,
}: {
  ing: Ingredient;
  addedMl: number;
  isPouring: boolean;
  isFull: boolean;
  h: CardHandlers;
}) {
  return (
    <button
      key={ing.id}
      type="button"
      data-testid={`bottle-${ing.id}`}
      disabled={isFull}
      aria-describedby="bottle-rack-hint"
      aria-label={`${ing.name}，${ing.abv}度${ing.carbonated ? '，含气泡' : ''}${
        addedMl > 0 ? `，已倒入 ${addedMl} 毫升` : ''
      }。轻点倒 ${APP_CONFIG.tapPourMl} 毫升，长按连续倾倒`}
      onPointerDown={(e) => h.down(ing, e)}
      onPointerMove={h.move}
      onPointerUp={h.up}
      onPointerLeave={h.leave}
      onPointerCancel={h.cancel}
      onClick={(e) => {
        // 键盘 Enter/Space 触发的 click（detail === 0）等同于轻点倒酒
        if (e.detail === 0) h.keyTap(ing);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`group relative flex items-center gap-2 p-2 rounded-xl text-left border transition-all touch-pan-y select-none ${
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
            <span className="font-mono-tech text-[10px] px-1 rounded bg-[#8F1D2C]/80 text-[#F5EBD6] shrink-0">
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
});

export const BottleRack: React.FC<BottleRackProps> = ({
  pours,
  totalMl,
  pouringId,
  onPourDelta,
  onPourStateChange,
}) => {
  const [category, setCategory] = useState<'all' | IngredientCategory>('all');
  const [hasMoreBelow, setHasMoreBelow] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const tapFlashTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const isFull = totalMl >= APP_CONFIG.maxGlassMl;
  const filtered =
    category === 'all' ? INGREDIENTS : INGREDIENTS.filter((i) => i.category === category);

  const checkScrollHint = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  };

  const pouredMap = new Map<string, number>();
  pours.forEach((p) => {
    pouredMap.set(p.ingredientId, (pouredMap.get(p.ingredientId) ?? 0) + p.ml);
  });

  const clearTimers = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  const clearTapFlash = () => {
    if (tapFlashTimerRef.current !== null) {
      window.clearTimeout(tapFlashTimerRef.current);
      tapFlashTimerRef.current = null;
    }
  };

  const pourTap = (ing: Ingredient) => {
    const poured = onPourDelta(ing, APP_CONFIG.tapPourMl, false);
    if (poured <= 0) return;
    clearTapFlash();
    onPourStateChange(ing);
    tapFlashTimerRef.current = window.setTimeout(() => {
      tapFlashTimerRef.current = null;
      onPourStateChange(null);
    }, 260);
  };

  /** 结束当前手势：mode=tap 时若既未进入长按也未滑动，则视为轻点倒 30ml */
  const endGesture = useCallback(
    (mode: 'tap' | 'cancel') => {
      clearTimers();
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g) return;
      try {
        if (g.el.hasPointerCapture?.(g.pointerId)) g.el.releasePointerCapture(g.pointerId);
      } catch {
        // 元素可能已卸载
      }
      if (mode === 'tap' && !g.holding && !g.moved) {
        pourTap(g.ing);
      } else if (g.holding) {
        onPourStateChange(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onPourDelta, onPourStateChange]
  );

  const changeCategory = (next: 'all' | IngredientCategory) => {
    // 切分类会卸载正在长按的瓶卡（不会再收到 pointerup），必须先停掉倾倒
    endGesture('cancel');
    setCategory(next);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
    const raf = requestAnimationFrame(checkScrollHint);
    return () => cancelAnimationFrame(raf);
  }, [category]);

  // 满杯立即停止长按倾倒
  useEffect(() => {
    if (isFull) endGesture('cancel');
  }, [isFull, endGesture]);

  // window 级兜底：手指在别处抬起、页面切后台、窗口失焦都要停止倾倒
  useEffect(() => {
    const stop = () => {
      if (gestureRef.current) endGesture('cancel');
    };
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [endGesture]);

  // 长按倾倒期间禁止列表滚动（非被动监听才能 preventDefault）
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return undefined;
    const onTouchMove = (e: TouchEvent) => {
      if (gestureRef.current?.holding && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // 卸载时清理所有定时器，并复位倾倒状态
  useEffect(() => {
    return () => {
      const hadFlash = tapFlashTimerRef.current !== null;
      clearTimers();
      clearTapFlash();
      if (gestureRef.current || hadFlash) {
        gestureRef.current = null;
        onPourStateChange(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (ing: Ingredient, e: React.PointerEvent<HTMLButtonElement>) => {
    // 注意：不要 preventDefault，否则触屏无法滚动酒架
    if (isFull) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    endGesture('cancel');

    const gesture: Gesture = {
      ing,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el: e.currentTarget,
      moved: false,
      holding: false,
    };
    gestureRef.current = gesture;

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (gestureRef.current !== gesture) return;
      gesture.holding = true;
      try {
        gesture.el.setPointerCapture(gesture.pointerId);
      } catch {
        // 指针可能已失效
      }
      clearTapFlash();
      const first = onPourDelta(ing, APP_CONFIG.holdPourStepMl, false);
      if (first <= 0) {
        endGesture('cancel');
        return;
      }
      onPourStateChange(ing);
      holdIntervalRef.current = window.setInterval(() => {
        const poured = onPourDelta(ing, APP_CONFIG.holdPourStepMl, true);
        if (poured <= 0) endGesture('cancel');
      }, APP_CONFIG.holdPourIntervalMs);
    }, HOLD_DELAY_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || g.holding) return;
    const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
    if (dist > MOVE_CANCEL_PX) {
      // 判定为滑动浏览，取消本次轻点/长按
      g.moved = true;
      endGesture('cancel');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    endGesture('tap');
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    // 长按期间已 setPointerCapture，不会触发 leave；这里只处理鼠标按下后移出
    if (!g || g.pointerId !== e.pointerId || g.holding) return;
    endGesture('cancel');
  };

  // 最新处理函数存 ref，向卡片传递恒定引用，避免 memo 失效
  const latestRef = useRef({
    down: handlePointerDown,
    move: handlePointerMove,
    up: handlePointerUp,
    leave: handlePointerLeave,
    cancel: () => endGesture('cancel'),
    keyTap: pourTap,
  });
  latestRef.current = {
    down: handlePointerDown,
    move: handlePointerMove,
    up: handlePointerUp,
    leave: handlePointerLeave,
    cancel: () => endGesture('cancel'),
    keyTap: pourTap,
  };
  const cardHandlers = useMemo<CardHandlers>(
    () => ({
      down: (ing, e) => latestRef.current.down(ing, e),
      move: (e) => latestRef.current.move(e),
      up: (e) => latestRef.current.up(e),
      leave: (e) => latestRef.current.leave(e),
      cancel: () => latestRef.current.cancel(),
      keyTap: (ing) => latestRef.current.keyTap(ing),
    }),
    []
  );

  return (
    <div className="flex flex-col gap-2">
      {/* 分类切换 + 提示 */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="原料分类">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`bottle-category-${cat.id}`}
                aria-pressed={active}
                onClick={() => changeCategory(cat.id)}
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
        <span
          id="bottle-rack-hint"
          className="text-[9.5px] text-[#C89B54] whitespace-nowrap shrink-0"
        >
          {isFull ? '已满杯' : '轻点/长按倒酒'}
        </span>
      </div>

      {/* 酒瓶两列滑架（含底部渐隐遮罩与下滑提示） */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          data-testid="bottle-rack-scroll"
          onScroll={checkScrollHint}
          className="grid grid-cols-2 gap-1.5 max-h-[164px] overflow-y-auto overscroll-contain no-scrollbar pr-0.5 pb-6 touch-pan-y"
        >
          {filtered.map((ing) => (
            <BottleCard
              key={ing.id}
              ing={ing}
              addedMl={pouredMap.get(ing.id) ?? 0}
              isPouring={pouringId === ing.id}
              isFull={isFull}
              h={cardHandlers}
            />
          ))}
        </div>

        {/* 柔和渐隐遮罩 + 下滑探索微提示 */}
        {hasMoreBelow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-[#130B08] via-[#130B08]/85 to-transparent flex items-end justify-center pb-0.5">
            <ChevronDown className="w-3.5 h-3.5 text-[#E5A93C]/80 animate-bounce" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
};
