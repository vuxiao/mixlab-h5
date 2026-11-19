import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  ChevronRight,
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
  loadCabinet,
  loadUnlockedClassics,
  removeFromCabinet,
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
import { PosterModal } from './components/PosterModal';
import { ResultSheet } from './components/ResultSheet';
import { ShakeControls } from './components/ShakeControls';

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
  const [soundOn, setSoundOn] = useState(true);

  const [currentResult, setCurrentResult] = useState<DrinkEvaluation | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
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

  const servedLockRef = useRef(false);
  const currentGuest = CHALLENGE_GUESTS[guestIdx % CHALLENGE_GUESTS.length];

  const totalMl = useMemo(() => computeTotalMl(pours), [pours]);
  const liveAbv = useMemo(
    () => computeAbv(pours, iceType, shakeProgress >= 100),
    [pours, iceType, shakeProgress]
  );

  const finalizeDrink = useCallback(
    (shaken: boolean) => {
      if (servedLockRef.current) return;
      if (computeTotalMl(pours) < APP_CONFIG.minServeMl) return;
      servedLockRef.current = true;
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
        const nextUnlocked = unlockClassic(evaluated.classicRecipe.id);
        setUnlockedClassics(nextUnlocked);
      }

      const judged =
        mode === 'challenge' ? judgeChallenge(currentGuest, evaluated) : null;

      soundEngine.playServeChord(evaluated.isClassic);
      setCurrentResult(evaluated);
      setChallengeResult(judged);
      setSavedCurrentId(null);
    },
    [pours, glassId, iceType, garnishes, mode, currentGuest]
  );

  // 摇晃到达 100% 自动触发出酒
  useEffect(() => {
    if (shakeProgress >= 100 && !servedLockRef.current && totalMl >= APP_CONFIG.minServeMl) {
      const timer = window.setTimeout(() => {
        finalizeDrink(true);
      }, 220);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [shakeProgress, totalMl, finalizeDrink]);

  const handlePourDelta = useCallback((ingredient: Ingredient, deltaMl: number) => {
    setPours((prev) => {
      const currTotal = computeTotalMl(prev);
      const room = APP_CONFIG.maxGlassMl - currTotal;
      if (room <= 0) return prev;
      const actual = Math.min(deltaMl, room);
      soundEngine.playPour((currTotal + actual) / APP_CONFIG.maxGlassMl);
      return [...prev, { ingredientId: ingredient.id, ml: actual }];
    });
    // 如果倒了新酒，摇匀进度轻微回退，提醒继续融合
    setShakeProgress((prev) => (prev > 0 ? Math.max(0, prev - 20) : 0));
  }, []);

  const handleUndoPour = useCallback(() => {
    setPours((prev) => prev.slice(0, -1));
    setShakeProgress(0);
  }, []);

  const handleClearGlass = useCallback(() => {
    setPours([]);
    setShakeProgress(0);
    setIsShaking(false);
    servedLockRef.current = false;
  }, []);

  const handleToggleGarnish = (id: GarnishId) => {
    soundEngine.playIceClink();
    setGarnishes((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleSelectIce = (id: IceType) => {
    soundEngine.playIceClink();
    setIceType(id);
  };

  const handleShakeBoost = useCallback((delta: number) => {
    soundEngine.playShakeTick();
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
    const next = saveToCabinet(item);
    setCabinet(next);
    setSavedCurrentId(id);
    soundEngine.playIceClink();
  };

  const handleDeleteSaved = (id: string) => {
    setCabinet(removeFromCabinet(id));
  };

  const handleMakeAnother = () => {
    setCurrentResult(null);
    setChallengeResult(null);
    setSavedCurrentId(null);
    setPours([]);
    setShakeProgress(0);
    setIsShaking(false);
    servedLockRef.current = false;
    setStep('pour');
    if (mode === 'challenge') {
      setGuestIdx((prev) => (prev + 1) % CHALLENGE_GUESTS.length);
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundEngine.setEnabled(next);
  };

  const goNextStep = () => {
    const order: AppStep[] = ['glass', 'ice', 'pour', 'shake'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) {
      setStep(order[idx + 1]);
    }
  };

  return (
    <div className="speakeasy-grain relative w-full max-w-[430px] h-[100dvh] flex flex-col bg-[#120B08] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.85)] sm:border-x sm:border-[#C89B54]/20">
      {/* 顶部复古刊头导航 */}
      <header className="safe-top relative z-20 px-3 pb-2 flex items-center justify-between gap-2 border-b border-[#C89B54]/20 bg-[#150D0A]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#8F1D2C] to-[#52101A] border border-[#E5A93C]/50 flex items-center justify-center shrink-0">
            <Wine className="w-4 h-4 text-[#E5A93C]" />
          </div>
          <div className="leading-tight">
            <h1 className="font-editorial text-[14.5px] font-bold tracking-wide text-[#F5EBD6] whitespace-nowrap">
              微醺研究所
            </h1>
            <p className="font-mono-tech text-[8.5px] tracking-[0.14em] text-[#E5A93C]/90 uppercase whitespace-nowrap">
              MIXLAB · EST.2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 自由调酒 / 微醺挑战 模式切换 */}
          <button
            type="button"
            data-testid="mode-toggle-btn"
            onClick={() => setMode((m) => (m === 'free' ? 'challenge' : 'free'))}
            className={`px-2 py-1 rounded-full text-[10.5px] font-semibold border flex items-center gap-1 whitespace-nowrap transition active:scale-95 ${
              mode === 'challenge'
                ? 'bg-[#8F1D2C] border-[#E5A93C]/70 text-[#F5EBD6]'
                : 'bg-[#1D130F] border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#E5A93C]" />
            {mode === 'challenge' ? '挑战中' : '盲品挑战'}
          </button>

          {/* 我的酒柜与图鉴 */}
          <button
            type="button"
            data-testid="open-cabinet-btn"
            onClick={() => setCabinetOpen(true)}
            className="px-2 py-1 rounded-full text-[10.5px] font-medium bg-[#1D130F] border border-[#C89B54]/35 text-[#F5EBD6] flex items-center gap-1 whitespace-nowrap hover:border-[#E5A93C] active:scale-95 transition"
          >
            <BookMarked className="w-3 h-3 text-[#E5A93C]" />
            <span>酒柜</span>
            <span className="font-mono-tech text-[9.5px] text-[#E5A93C]">
              {unlockedClassics.length}/{CLASSIC_RECIPES.length}
            </span>
          </button>

          {/* 音效开关 */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundOn ? '关闭音效' : '开启音效'}
            className="w-7 h-7 rounded-full bg-[#1D130F] border border-[#C89B54]/30 flex items-center justify-center text-[#C89B54] active:scale-95 transition shrink-0"
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 opacity-55" />}
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
        onUndoPour={handleUndoPour}
        onClearGlass={handleClearGlass}
      />

      {/* 底部五步沉浸式操控舱 */}
      <section className="safe-bottom relative z-20 px-3 pt-2.5 bg-gradient-to-t from-[#0D0705] via-[#170F0B] to-[#1D130E]/95 border-t border-[#C89B54]/30 rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.6)] shrink-0">
        {/* 步骤条 */}
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {STEPS.map((s) => {
            const active = step === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`step-tab-${s.id}`}
                onClick={() => setStep(s.id)}
                className={`py-1.5 px-1 rounded-lg border text-center transition flex items-center justify-center gap-1 ${
                  active
                    ? 'bg-[#2C1913] border-[#E5A93C] text-[#F5EBD6] shadow-[0_0_12px_rgba(229,169,60,0.2)]'
                    : 'bg-[#150E0B] border-[#C89B54]/20 text-[#A89680] hover:text-[#E6D9C3]'
                }`}
              >
                <span className="font-mono-tech text-[9.5px] text-[#E5A93C]">{s.num}</span>
                <span className="text-[11px] font-semibold">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* 当前步骤内容面板 */}
        <div className="min-h-[188px] flex flex-col justify-between">
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
                      onClick={() => {
                        soundEngine.playIceClink();
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
                      <p className="text-[9.5px] text-[#A89680] leading-tight mt-1 line-clamp-2">
                        {g.tagline}
                      </p>
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
                选定杯型 · 下一步加冰与装饰
                <ChevronRight className="w-4 h-4 text-[#E5A93C]" />
              </button>
            </div>
          )}

          {step === 'ice' && (
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="text-[10.5px] text-[#C89B54] mb-1.5 flex items-center justify-between">
                  <span>选择冰块形态</span>
                  <span className="font-mono-tech text-[9.5px] text-[#A89680]">ICE STYLE</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ICE_OPTIONS.map((opt) => {
                    const active = iceType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`ice-option-${opt.id}`}
                        onClick={() => handleSelectIce(opt.id)}
                        className={`py-2 px-2 rounded-xl border text-left transition active:scale-95 ${
                          active
                            ? 'bg-[#2B1813] border-[#E5A93C] text-[#F5EBD6]'
                            : 'bg-[#170F0C] border-[#C89B54]/20 text-[#C7B69C]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.name}</div>
                        <div className="text-[9.5px] text-[#A89680] mt-0.5 leading-tight">
                          {opt.desc.slice(0, 8)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10.5px] text-[#C89B54] mb-1.5 flex items-center justify-between">
                  <span>杯口风味装饰（最多选 2 种）</span>
                  <span className="font-mono-tech text-[9.5px] text-[#A89680]">
                    {garnishes.length}/2
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GARNISHES.map((g) => {
                    const active = garnishes.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        data-testid={`garnish-option-${g.id}`}
                        onClick={() => handleToggleGarnish(g.id)}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5 transition active:scale-95 ${
                          active
                            ? 'bg-[#2C1913] border-[#E5A93C] text-[#F5EBD6]'
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
                去吧台倒酒 · 探索 16 种风味原料
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
                  ? `请先倾倒至少 ${APP_CONFIG.minServeMl}ml 原料`
                  : `已倒入 ${totalMl}ml · 下一步摇晃调匀出酒`}
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
            />
          )}
        </div>
      </section>

      {/* 成品品鉴与酒单结果层 */}
      {currentResult && (
        <ResultSheet
          drink={currentResult}
          challengeResult={challengeResult}
          isSaved={Boolean(savedCurrentId)}
          onSaveToCabinet={handleSaveCurrent}
          onGeneratePoster={() =>
            setPosterTarget({
              drink: currentResult,
              stars: challengeResult?.stars,
            })
          }
          onMakeAnother={handleMakeAnother}
          onClose={() => {
            setCurrentResult(null);
            servedLockRef.current = false;
            setShakeProgress(0);
          }}
        />
      )}

      {/* 我的微醺酒柜 & 经典配方图鉴 */}
      {cabinetOpen && (
        <CabinetDrawer
          cabinet={cabinet}
          unlockedClassicIds={unlockedClassics}
          onOpenPoster={(item) =>
            setPosterTarget({ drink: item, stars: item.challengeStars })
          }
          onDeleteItem={handleDeleteSaved}
          onClose={() => setCabinetOpen(false)}
        />
      )}

      {/* 高清特调酒单海报弹窗 */}
      {posterTarget && (
        <PosterModal
          drink={posterTarget.drink}
          challengeStars={posterTarget.stars}
          onClose={() => setPosterTarget(null)}
        />
      )}
    </div>
  );
}

export default App;
