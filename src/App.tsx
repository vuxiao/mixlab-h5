import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookMarked,
  ChevronRight,
  Info,
  Sparkles,
  Volume2,
  VolumeX,
  Wine,
} from 'lucide-react';
import { APP_CONFIG } from './config';
import { CHALLENGE_GUESTS } from './data/challenges';
import { GARNISHES, ICE_OPTIONS } from './data/garnishes';
import { GLASSES } from './data/glasses';
import { CLASSIC_RECIPES } from './data/recipes';
import { judgeChallenge } from './engine/challengeJudge';
import {
  computeAbv,
  computeTotalMl,
  evaluateCocktail,
} from './engine/flavorEngine';
import { soundEngine } from './engine/soundEngine';
import {
  allocateSerialNo,
  hasEnteredThisSession,
  loadCabinet,
  loadSoundPref,
  loadUnlockedClassics,
  markEnteredThisSession,
  removeFromCabinet,
  saveSoundPref,
  saveToCabinet,
  unlockClassic,
} from './storage/cabinetStorage';
import {
  AppStep,
  ChallengeResult,
  DrinkEvaluation,
  GameMode,
  GarnishId,
  GlassId,
  IceType,
  Ingredient,
  PourEntry,
  SavedCocktail,
} from './types';
import { BottleRack } from './components/BottleRack';
import { CabinetDrawer } from './components/CabinetDrawer';
import { ChallengeBanner } from './components/ChallengeBanner';
import { CocktailGlassStage } from './components/CocktailGlassStage';
import { IntroCover } from './components/IntroCover';
import { ModalLoading } from './components/ModalLoading';
import { ResultSheet } from './components/ResultSheet';
import { ShakeControls } from './components/ShakeControls';
import { Toast, ToastMessage, ToastTone } from './components/Toast';
import { Presence } from './components/Presence';
import { haptic } from './utils/haptics';

// 海报引擎（canvas 绘制 + qrcode）体积较大，按需懒加载，首包更轻
const PosterModal = lazy(() =>
  import('./components/PosterModal').then((m) => ({ default: m.PosterModal }))
);
const BrandPosterModal = lazy(() =>
  import('./components/BrandPosterModal').then((m) => ({ default: m.BrandPosterModal }))
);

const MAX_GARNISHES = 2;

/** 当前杯中作品的「指纹」：配方/杯型/冰/装饰任一变化，都视为一杯新酒 */
function drinkSignature(
  pours: PourEntry[],
  glassId: GlassId,
  iceType: IceType,
  garnishes: GarnishId[]
): string {
  return JSON.stringify([glassId, iceType, [...garnishes].sort(), pours.map((p) => [p.ingredientId, p.ml])]);
}

const STEPS: Array<{ id: AppStep; num: string; label: string }> = [
  { id: 'glass', num: '01', label: '选杯' },
  { id: 'ice', num: '02', label: '冰与饰' },
  { id: 'pour', num: '03', label: '倒酒' },
  { id: 'shake', num: '04', label: '摇匀' },
];

const MiniGlassIcon: React.FC<{ id: GlassId; active: boolean }> = ({ id, active }) => {
  const stroke = active ? '#E5A93C' : '#C7B69C';
  return (
    <svg viewBox="0 0 40 44" className="w-8 h-9 mx-auto" aria-hidden="true">
      {id === 'martini' && (
        <g fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round">
          <path d="M 7 10 L 33 10 L 20 25 Z" />
          <line x1="20" y1="25" x2="20" y2="38" />
          <line x1="12" y1="38" x2="28" y2="38" />
        </g>
      )}
      {id === 'rocks' && (
        <g fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round">
          <path d="M 9 12 L 11 37 L 29 37 L 31 12 Z" />
          <line x1="11" y1="32" x2="29" y2="32" strokeOpacity="0.45" />
        </g>
      )}
      {id === 'highball' && (
        <g fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round">
          <path d="M 12 6 L 14 38 L 26 38 L 28 6 Z" />
          <line x1="14" y1="33" x2="26" y2="33" strokeOpacity="0.45" />
        </g>
      )}
    </svg>
  );
};

export function App() {
  const [showIntro, setShowIntro] = useState(() => !hasEnteredThisSession());
  const [brandPosterOpen, setBrandPosterOpen] = useState(false);
  const [mode, setMode] = useState<GameMode>('free');
  const [step, setStep] = useState<AppStep>('glass');
  const [glassId, setGlassId] = useState<GlassId>('highball');
  const [iceType, setIceType] = useState<IceType>('cubes');
  const [garnishes, setGarnishes] = useState<GarnishId[]>(['lime']);
  const [pours, setPours] = useState<PourEntry[]>([]);
  const [pouringIngredient, setPouringIngredient] = useState<Ingredient | null>(null);

  const [shakeProgress, setShakeProgress] = useState(0);
  const [isShaking, setIsShaking] = useState(false);

  const [guestIdx, setGuestIdx] = useState(0);
  const [soundOn, setSoundOn] = useState(() => loadSoundPref());

  // 本杯已出酒的结果（关闭品鉴卡后仍保留，可再次查看；改配方后才清除）
  const [currentResult, setCurrentResult] = useState<DrinkEvaluation | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [savedCurrentId, setSavedCurrentId] = useState<string | null>(null);

  const [posterTarget, setPosterTarget] = useState<{
    drink: DrinkEvaluation;
    stars?: number;
  } | null>(null);

  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [cabinet, setCabinet] = useState<SavedCocktail[]>(() => loadCabinet());
  const [unlockedClassics, setUnlockedClassics] = useState<string[]>(() =>
    loadUnlockedClassics()
  );

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
    if (tone === 'error') haptic([18, 40, 18]);
    setToast({ id: Date.now() + Math.random(), text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // 倒酒走 ref 同步计算，避免在 setState updater 里产生副作用（StrictMode 双响）
  const poursRef = useRef<PourEntry[]>([]);
  const commitPours = useCallback((next: PourEntry[]) => {
    poursRef.current = next;
    setPours(next);
  }, []);

  const signature = useMemo(
    () => drinkSignature(pours, glassId, iceType, garnishes),
    [pours, glassId, iceType, garnishes]
  );
  // 已出酒作品的指纹：与当前一致说明「这杯已经出过了」，禁止重复出酒占用新编号
  const servedSigRef = useRef<string | null>(null);
  const isServed = currentResult !== null && servedSigRef.current === signature;

  const currentGuest = CHALLENGE_GUESTS[guestIdx % CHALLENGE_GUESTS.length];

  const totalMl = useMemo(() => computeTotalMl(pours), [pours]);
  const liveAbv = useMemo(
    () => computeAbv(pours, iceType, shakeProgress >= 100),
    [pours, iceType, shakeProgress]
  );

  useEffect(() => {
    soundEngine.setEnabled(soundOn);
  }, [soundOn]);

  // 配方/杯型/冰/装饰一旦改动，上一杯的出酒结果作废，摇匀进度归零，解锁出酒
  useEffect(() => {
    if (servedSigRef.current && servedSigRef.current !== signature) {
      servedSigRef.current = null;
      setCurrentResult(null);
      setChallengeResult(null);
      setSavedCurrentId(null);
      setResultOpen(false);
      setShakeProgress(0);
    }
  }, [signature]);

  const finalizeDrink = useCallback(
    (shaken: boolean) => {
      if (servedSigRef.current === signature) return;
      if (computeTotalMl(pours) < APP_CONFIG.minServeMl) return;
      servedSigRef.current = signature;
      setIsShaking(false);

      const serialNo = allocateSerialNo();
      const evaluated = evaluateCocktail({
        pours,
        glassId,
        iceType,
        garnishes,
        shaken,
        serialNo,
      });

      if (evaluated.classicRecipe) {
        setUnlockedClassics(unlockClassic(evaluated.classicRecipe.id).list);
      }

      const judged =
        mode === 'challenge' ? judgeChallenge(currentGuest, evaluated) : null;

      soundEngine.playServeChord(evaluated.isClassic);
      haptic(evaluated.isClassic ? [10, 30, 10, 30, 26] : [12, 40, 18]);
      setCurrentResult(evaluated);
      setChallengeResult(judged);
      setSavedCurrentId(null);
      setResultOpen(true);
    },
    [signature, pours, glassId, iceType, garnishes, mode, currentGuest]
  );

  // 摇晃到达 100% 自动触发出酒
  useEffect(() => {
    if (
      shakeProgress >= 100 &&
      servedSigRef.current !== signature &&
      totalMl >= APP_CONFIG.minServeMl
    ) {
      const timer = window.setTimeout(() => {
        finalizeDrink(true);
      }, 220);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [shakeProgress, totalMl, signature, finalizeDrink]);

  /**
   * 倒酒：返回实际倒入毫升数。
   * merge=true（同一次长按的后续增量）会并入上一条记录，撤销时整次长按一起撤回。
   */
  const handlePourDelta = useCallback(
    (ingredient: Ingredient, deltaMl: number, merge: boolean): number => {
      const prev = poursRef.current;
      const currTotal = computeTotalMl(prev);
      const room = APP_CONFIG.maxGlassMl - currTotal;
      if (room <= 0) return 0;
      const actual = Math.min(deltaMl, room);
      const last = prev[prev.length - 1];
      const next =
        merge && last && last.ingredientId === ingredient.id
          ? [...prev.slice(0, -1), { ingredientId: ingredient.id, ml: last.ml + actual }]
          : [...prev, { ingredientId: ingredient.id, ml: actual }];
      commitPours(next);
      soundEngine.playPour((currTotal + actual) / APP_CONFIG.maxGlassMl);
      haptic(merge ? 4 : 10, merge ? 90 : 30);
      // 倒了新酒，摇匀进度轻微回退，提醒继续融合
      setShakeProgress((p) => (p > 0 ? Math.max(0, p - 20) : 0));
      return actual;
    },
    [commitPours]
  );

  const handleUndoPour = useCallback(() => {
    commitPours(poursRef.current.slice(0, -1));
    setShakeProgress(0);
  }, [commitPours]);

  const handleClearGlass = useCallback(() => {
    commitPours([]);
    setShakeProgress(0);
    setIsShaking(false);
  }, [commitPours]);

  const handleToggleGarnish = (id: GarnishId) => {
    if (!garnishes.includes(id) && garnishes.length >= MAX_GARNISHES) {
      showToast(`最多选 ${MAX_GARNISHES} 种装饰`, 'info');
      return;
    }
    soundEngine.playIceClink();
    haptic(8);
    setGarnishes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, MAX_GARNISHES)
    );
  };

  const handleSelectIce = (id: IceType) => {
    soundEngine.playIceClink();
    haptic(8);
    setIceType(id);
  };

  const handleShakeBoost = useCallback((delta: number) => {
    soundEngine.playShakeTick();
    haptic(6, 80);
    setShakeProgress((prev) => Math.min(100, prev + delta));
  }, []);

  const handleSaveCurrent = () => {
    if (!currentResult || savedCurrentId) return;
    const id = `${currentResult.serialNo}-${Date.now()}`;
    const item: SavedCocktail = {
      ...currentResult,
      id,
      challengeStars: challengeResult?.stars,
      challengeGuestName: challengeResult?.guest.guestName,
    };
    const result = saveToCabinet(item);
    if (!result.ok) {
      showToast('收藏失败：存储空间不足', 'error');
      return;
    }
    setCabinet(result.list);
    setSavedCurrentId(id);
    soundEngine.playIceClink();
  };

  const handleDeleteSaved = (id: string) => {
    const result = removeFromCabinet(id);
    if (!result.ok) {
      showToast('删除失败', 'error');
      return;
    }
    setCabinet(result.list);
    if (id === savedCurrentId) setSavedCurrentId(null);
  };

  const resetForNextDrink = () => {
    servedSigRef.current = null;
    setCurrentResult(null);
    setChallengeResult(null);
    setSavedCurrentId(null);
    setResultOpen(false);
    commitPours([]);
    setShakeProgress(0);
    setIsShaking(false);
  };

  const handleMakeAnother = () => {
    resetForNextDrink();
    setStep('pour');
    if (mode === 'challenge') {
      setGuestIdx((prev) => (prev + 1) % CHALLENGE_GUESTS.length);
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundEngine.setEnabled(next);
    saveSoundPref(next);
  };

  // 步骤切换方向（前进从右滑入，后退从左滑入）
  const stepIndex = STEPS.findIndex((x) => x.id === step);
  const prevStepIndexRef = useRef(stepIndex);
  const stepDir = stepIndex >= prevStepIndexRef.current ? 1 : -1;
  useEffect(() => {
    prevStepIndexRef.current = stepIndex;
  }, [stepIndex]);

  const resultPayload = useMemo(
    () =>
      currentResult && resultOpen
        ? { drink: currentResult, challenge: challengeResult, saved: Boolean(savedCurrentId) }
        : null,
    [currentResult, resultOpen, challengeResult, savedCurrentId]
  );

  const enterBar = (nextMode?: GameMode) => {
    soundEngine.playIceClink();
    if (nextMode) setMode(nextMode);
    markEnteredThisSession();
    setShowIntro(false);
  };

  const goNextStep = () => {
    const order: AppStep[] = ['glass', 'ice', 'pour', 'shake'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) {
      setStep(order[idx + 1]);
    }
  };

  return (
    <div
      className="speakeasy-grain app-shell relative w-full max-w-[430px] flex flex-col bg-[#120B08] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.85)] sm:border-x sm:border-[#C89B54]/20"
    >
      {/* 顶部复古刊头导航（<360px 自动收起副标题与文字标签，保证 320 宽全部按钮可点） */}
      <header className="safe-top relative z-20 px-2 xs:px-3 pb-2 flex items-center justify-between gap-1.5 xs:gap-2 border-b border-[#C89B54]/20 bg-[#150D0A] shrink-0">
        <div className="flex items-center gap-1.5 xs:gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#8F1D2C] to-[#52101A] border border-[#E5A93C]/50 flex items-center justify-center shrink-0">
            <Wine className="w-4 h-4 text-[#E5A93C]" aria-hidden="true" />
          </div>
          <div className="leading-tight min-w-0 overflow-hidden">
            <h1 className="font-editorial text-[13px] xs:text-[14.5px] font-bold tracking-wide text-[#F5EBD6] whitespace-nowrap truncate">
              微醺研究所
            </h1>
            <p className="hidden min-[400px]:block font-mono-tech text-[8.5px] tracking-[0.14em] text-[#E5A93C]/90 uppercase whitespace-nowrap">
              MIXLAB · EST.2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 自由调酒 / 微醺挑战 模式切换 */}
          <button
            type="button"
            data-testid="mode-toggle-btn"
            aria-pressed={mode === 'challenge'}
            aria-label={mode === 'challenge' ? '盲品挑战中，点击回到自由调酒' : '开启盲品挑战模式'}
            onClick={() => setMode((m) => (m === 'free' ? 'challenge' : 'free'))}
            className={`h-7 px-2 rounded-full text-[10.5px] font-semibold border flex items-center gap-1 whitespace-nowrap transition active:scale-95 ${
              mode === 'challenge'
                ? 'bg-[#8F1D2C] border-[#E5A93C]/70 text-[#F5EBD6]'
                : 'bg-[#1D130F] border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#E5A93C]" aria-hidden="true" />
            <span className="hidden xs:inline">{mode === 'challenge' ? '挑战中' : '盲品'}</span>
          </button>

          {/* 我的酒柜与图鉴：收藏数 + 图鉴解锁数分开显示 */}
          <button
            type="button"
            data-testid="open-cabinet-btn"
            onClick={() => setCabinetOpen(true)}
            aria-label={`打开酒柜：已收藏 ${cabinet.length} 杯，经典图鉴解锁 ${unlockedClassics.length}/${CLASSIC_RECIPES.length}`}
            className="h-7 px-2 rounded-full text-[10.5px] font-medium bg-[#1D130F] border border-[#C89B54]/35 text-[#F5EBD6] flex items-center gap-1 whitespace-nowrap hover:border-[#E5A93C] active:scale-95 transition"
          >
            <BookMarked className="w-3 h-3 text-[#E5A93C]" aria-hidden="true" />
            <span className="hidden min-[400px]:inline">收藏</span>
            <span data-testid="header-saved-count" className="font-mono-tech text-[9.5px] text-[#E5A93C]">
              {cabinet.length}
            </span>
            <span className="text-[#C89B54]/45" aria-hidden="true">·</span>
            <Award className="w-3 h-3 text-[#E5A93C] min-[400px]:hidden" aria-hidden="true" />
            <span className="hidden min-[400px]:inline">图鉴</span>
            <span data-testid="header-codex-count" className="font-mono-tech text-[9.5px] text-[#E5A93C]">
              {unlockedClassics.length}/{CLASSIC_RECIPES.length}
            </span>
          </button>

          {/* 重新打开酒馆介绍 / 官方海报 */}
          <button
            type="button"
            data-testid="open-intro-btn"
            onClick={() => setShowIntro(true)}
            aria-label="酒馆介绍与官方海报"
            className="w-7 h-7 rounded-full bg-[#1D130F] border border-[#C89B54]/30 flex items-center justify-center text-[#E5A93C] hover:border-[#E5A93C] active:scale-95 transition shrink-0"
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {/* 音效开关（偏好持久化） */}
          <button
            type="button"
            data-testid="sound-toggle-btn"
            onClick={handleToggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? '关闭音效' : '开启音效'}
            className="w-7 h-7 rounded-full bg-[#1D130F] border border-[#C89B54]/30 flex items-center justify-center text-[#C89B54] active:scale-95 transition shrink-0"
          >
            {soundOn ? (
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 opacity-55" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* 可选：微醺挑战盲品订单横幅 */}
      {mode === 'challenge' && (
        <ChallengeBanner
          guest={currentGuest}
          onNextGuest={() => setGuestIdx((prev) => (prev + 1) % CHALLENGE_GUESTS.length)}
        />
      )}

      {/* 中央核心调酒视觉舞台 */}
      <CocktailGlassStage
        glassId={glassId}
        iceType={iceType}
        garnishes={garnishes}
        pours={pours}
        abv={liveAbv}
        totalMl={totalMl}
        shakeProgress={shakeProgress}
        isShaking={isShaking}
        pouringIngredient={pouringIngredient}
        paused={showIntro}
        onUndoPour={handleUndoPour}
        onClearGlass={handleClearGlass}
      />

      {/* 底部五步沉浸式操控舱 */}
      <section className="safe-bottom relative z-20 px-3 pt-2.5 bg-gradient-to-t from-[#0D0705] via-[#170F0B] to-[#1D130E]/95 border-t border-[#C89B54]/30 rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.6)] shrink-0">
        {/* 步骤条 */}
        <nav
          className="relative grid grid-cols-4 gap-1 p-1 mb-2.5 rounded-xl bg-[#120B08] border border-[#C89B54]/18"
          aria-label="调酒步骤"
        >
          {/* iOS 分段控件滑块 */}
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 rounded-lg bg-[#2C1913] border border-[#E5A93C] shadow-[0_0_14px_rgba(229,169,60,0.22)]"
            style={{
              width: 'calc((100% - 20px) / 4)',
              transform: `translateX(calc(${stepIndex} * (100% + 4px)))`,
              transition: 'transform 460ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
          {STEPS.map((s) => {
            const active = step === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`step-tab-${s.id}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  if (!active) haptic(6);
                  setStep(s.id);
                }}
                className={`relative z-10 py-1.5 px-1 rounded-lg text-center flex items-center justify-center gap-1 active:scale-95 ${
                  active ? 'text-[#F5EBD6]' : 'text-[#A89680] hover:text-[#E6D9C3]'
                }`}
              >
                <span className="font-mono-tech text-[9.5px] text-[#E5A93C]">{s.num}</span>
                <span className="text-[11px] font-semibold">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 当前步骤内容面板 */}
        <div className="min-h-[188px] flex flex-col justify-between overflow-x-clip">
          <div key={step} className={stepDir > 0 ? 'anim-step-next' : 'anim-step-prev'}>
          {step === 'glass' && (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-3 gap-2">
                {GLASSES.map((g) => {
                  const active = glassId === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      data-testid={`glass-option-${g.id}`}
                      aria-pressed={active}
                      onClick={() => {
                        soundEngine.playIceClink();
                        haptic(8);
                        setGlassId(g.id);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition-all active:scale-95 ${
                        active
                          ? 'bg-[#2B1813] border-[#E5A93C] shadow-[0_0_16px_rgba(229,169,60,0.22)]'
                          : 'bg-[#170F0C] border-[#C89B54]/22 hover:border-[#C89B54]/50'
                      }`}
                    >
                      <MiniGlassIcon id={g.id} active={active} />
                      <div className="text-xs font-bold text-[#F5EBD6] mt-1.5">{g.name}</div>
                      <div className="font-mono-tech text-[9px] text-[#C89B54] uppercase mt-0.5">
                        {g.enName.split(' ')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="next-step-btn"
                onClick={goNextStep}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#8F1D2C] to-[#A82738] text-[#F5EBD6] text-xs font-semibold border border-[#E5A93C]/55 flex items-center justify-center gap-1 active:scale-[0.98] transition"
              >
                下一步
                <ChevronRight className="w-4 h-4 text-[#E5A93C]" />
              </button>
            </div>
          )}

          {step === 'ice' && (
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="text-[10.5px] text-[#C89B54] mb-1.5 flex items-center justify-between">
                  <span>冰块</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ICE_OPTIONS.map((opt) => {
                    const active = iceType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`ice-option-${opt.id}`}
                        aria-pressed={active}
                        onClick={() => handleSelectIce(opt.id)}
                        className={`py-2 px-2 rounded-xl border text-left transition active:scale-95 ${
                          active
                            ? 'bg-[#2B1813] border-[#E5A93C] text-[#F5EBD6]'
                            : 'bg-[#170F0C] border-[#C89B54]/20 text-[#C7B69C]'
                        }`}
                      >
                        <div className="text-[11.5px] font-semibold leading-tight">{opt.name}</div>
                        <div
                          data-testid={`ice-desc-${opt.id}`}
                          className="text-[9.5px] text-[#B8A690] mt-1 leading-snug"
                        >
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10.5px] text-[#C89B54] mb-1.5 flex items-center justify-between">
                  <span>装饰</span>
                  <span className="font-mono-tech text-[9.5px] text-[#A89680]">
                    {garnishes.length}/{MAX_GARNISHES}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GARNISHES.map((g) => {
                    const active = garnishes.includes(g.id);
                    const locked = !active && garnishes.length >= MAX_GARNISHES;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        data-testid={`garnish-option-${g.id}`}
                        aria-pressed={active}
                        aria-disabled={locked || undefined}
                        onClick={() => handleToggleGarnish(g.id)}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 transition active:scale-95 ${
                          active
                            ? 'bg-[#2C1913] border-[#E5A93C] text-[#F5EBD6]'
                            : locked
                            ? 'bg-[#140D0A] border-[#C89B54]/12 text-[#6F5E4E] opacity-60'
                            : 'bg-[#170F0C] border-[#C89B54]/22 text-[#B8A690]'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                data-testid="next-step-btn"
                onClick={goNextStep}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#8F1D2C] to-[#A82738] text-[#F5EBD6] text-xs font-semibold border border-[#E5A93C]/55 flex items-center justify-center gap-1 active:scale-[0.98] transition"
              >
                下一步
                <ChevronRight className="w-4 h-4 text-[#E5A93C]" />
              </button>
            </div>
          )}

          {step === 'pour' && (
            <div className="flex flex-col gap-2">
              <BottleRack
                pours={pours}
                totalMl={totalMl}
                pouringId={pouringIngredient?.id ?? null}
                onPourDelta={handlePourDelta}
                onPourStateChange={setPouringIngredient}
              />

              <button
                type="button"
                data-testid="go-shake-btn"
                disabled={totalMl < APP_CONFIG.minServeMl}
                onClick={() => setStep('shake')}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-[#8F1D2C] to-[#A82738] text-[#F5EBD6] text-xs font-semibold border border-[#E5A93C]/55 flex items-center justify-center gap-1 disabled:opacity-40 active:scale-[0.98] transition"
              >
                {totalMl < APP_CONFIG.minServeMl
                  ? `至少倒入 ${APP_CONFIG.minServeMl}ml`
                  : isServed
                  ? '已出酒'
                  : '去摇匀'}
                <ChevronRight className="w-4 h-4 text-[#E5A93C]" />
              </button>
            </div>
          )}

          {step === 'shake' && (
            <ShakeControls
              totalMl={totalMl}
              shakeProgress={shakeProgress}
              isShaking={isShaking}
              onShakeBoost={handleShakeBoost}
              onSetShaking={setIsShaking}
              onServeLayered={() => finalizeDrink(false)}
              onBackToPour={() => setStep('pour')}
              servedSerialNo={isServed ? currentResult?.serialNo ?? null : null}
              onReopenResult={() => setResultOpen(true)}
              onMakeAnother={handleMakeAnother}
            />
          )}
          </div>
        </div>
      </section>

      {/* 成品品鉴与酒单结果层 */}
      <Presence value={resultPayload} exitMs={300}>
        {(r, closing) => (
          <ResultSheet
            drink={r.drink}
            challengeResult={r.challenge}
            isSaved={r.saved}
            closing={closing}
            onSaveToCabinet={handleSaveCurrent}
            onGeneratePoster={() =>
              setPosterTarget({
                drink: r.drink,
                stars: r.challenge?.stars,
              })
            }
            onMakeAnother={handleMakeAnother}
            onClose={() => setResultOpen(false)}
          />
        )}
      </Presence>

      {/* 我的酒柜 & 经典配方图鉴 */}
      <Presence value={cabinetOpen} exitMs={300}>
        {(_, closing) => (
          <CabinetDrawer
            cabinet={cabinet}
            unlockedClassicIds={unlockedClassics}
            closing={closing}
            onOpenPoster={(item) =>
              setPosterTarget({ drink: item, stars: item.challengeStars })
            }
            onDeleteItem={handleDeleteSaved}
            onClose={() => setCabinetOpen(false)}
          />
        )}
      </Presence>

      {/* 高清特调酒单海报弹窗（懒加载） */}
      <Presence value={posterTarget} exitMs={240}>
        {(target, closing) => (
          <Suspense fallback={<ModalLoading label="海报印制中…" />}>
            <PosterModal
              drink={target.drink}
              challengeStars={target.stars}
              closing={closing}
              onClose={() => setPosterTarget(null)}
              onNotify={showToast}
            />
          </Suspense>
        )}
      </Presence>

      {/* 首屏全屏产品介绍页 */}
      <Presence value={showIntro} exitMs={480}>
        {(_, closing) => (
          <IntroCover
            closing={closing}
            onEnterBar={() => enterBar()}
            onEnterChallenge={() => enterBar('challenge')}
            onOpenBrandPoster={() => {
              soundEngine.playIceClink();
              setBrandPosterOpen(true);
            }}
          />
        )}
      </Presence>

      {/* 官方邀请函海报弹窗（懒加载） */}
      <Presence value={brandPosterOpen} exitMs={240}>
        {(_, closing) => (
          <Suspense fallback={<ModalLoading label="邀请函印制中…" />}>
            <BrandPosterModal
              closing={closing}
              onClose={() => setBrandPosterOpen(false)}
              onNotify={showToast}
            />
          </Suspense>
        )}
      </Presence>

      <Toast toast={toast} onDismiss={dismissToast} />

      {/* 横屏提示：手机横屏时舞台空间不足，引导竖屏体验 */}
      <div className="landscape-guard" role="alert">
        <div className="flex flex-col items-center gap-2 text-center px-6">
          <div className="text-3xl" aria-hidden="true">📱</div>
          <p className="font-editorial text-lg font-bold text-[#F5EBD6]">请竖屏使用</p>
        </div>
      </div>
    </div>
  );
}

export default App;
