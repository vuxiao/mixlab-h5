import React from 'react';
import { Award, Bookmark, BookmarkCheck, FileImage, RotateCcw, Star, X } from 'lucide-react';
import { GLASS_MAP } from '../data/glasses';
import { computeLiquidLayers } from '../engine/flavorEngine';
import { ChallengeResult, DrinkEvaluation } from '../types';
import { FlavorRadarChart } from './FlavorRadarChart';

interface ResultSheetProps {
  drink: DrinkEvaluation;
  challengeResult: ChallengeResult | null;
  isSaved: boolean;
  onSaveToCabinet: () => void;
  onGeneratePoster: () => void;
  onMakeAnother: () => void;
  onClose: () => void;
}

export const ResultSheet: React.FC<ResultSheetProps> = ({
  drink,
  challengeResult,
  isSaved,
  onSaveToCabinet,
  onGeneratePoster,
  onMakeAnother,
  onClose,
}) => {
  const layers = computeLiquidLayers(drink.pours).sort((a, b) => b.ml - a.ml);
  const glassMeta = GLASS_MAP[drink.glassId];

  return (
    <div
      data-testid="result-sheet"
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4"
    >
      <div className="w-full max-w-[410px] max-h-[92vh] overflow-y-auto no-scrollbar rounded-2xl bg-[#19100C] border border-[#C89B54]/45 shadow-[0_24px_60px_rgba(0,0,0,0.8)] animate-sheet-up">
        {/* 顶部杂志式酒单标题栏 */}
        <div className="relative px-4 pt-4 pb-3 border-b border-[#C89B54]/20 bg-gradient-to-b from-[#2A1812] to-[#19100C]">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭品鉴卡"
            className="absolute right-3 top-3 w-7 h-7 rounded-full bg-[#120B08]/80 border border-[#C89B54]/30 flex items-center justify-center text-[#C7B69C] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-mono-tech text-[10px] px-2 py-0.5 rounded bg-[#120B08] border border-[#C89B54]/35 text-[#E5A93C]">
              NO. {drink.serialNo}
            </span>
            <span className="text-[10px] text-[#C7B69C]">
              {glassMeta?.name} · {drink.totalMl}ml · {drink.shaken ? '摇匀呈现' : '分层静置'}
            </span>
          </div>

          <div className="mt-2.5 flex items-start justify-between gap-2">
            <div>
              <h2
                data-testid="result-drink-name"
                className="font-editorial text-2xl font-bold text-[#F5EBD6] leading-tight"
              >
                {drink.name}
              </h2>
              <p className="font-editorial italic text-xs text-[#E5A93C]/90 tracking-wider mt-0.5">
                {drink.enName}
              </p>
            </div>

            {drink.isClassic && (
              <div
                data-testid="classic-unlocked-badge"
                className="animate-stamp-slam shrink-0 px-2.5 py-1 rounded border-2 border-[#E5A93C] bg-[#8F1D2C]/90 text-center shadow-lg"
              >
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#F5EBD6]">
                  <Award className="w-3 h-3 text-[#E5A93C]" />
                  解锁经典
                </div>
                <div className="font-mono-tech text-[8px] text-[#E5A93C] tracking-widest">
                  CLASSIC
                </div>
              </div>
            )}
          </div>

          <p className="mt-2.5 text-xs text-[#DFD0B8] leading-relaxed">
            “{drink.bartenderNote}”
          </p>

          {drink.classicRecipe && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-[#2A1419]/80 border border-[#E5A93C]/30 text-[11px] text-[#F4D9B0]">
              <span className="font-mono-tech text-[#E5A93C] mr-1.5">
                [{drink.classicRecipe.era}]
              </span>
              {drink.classicRecipe.story}
            </div>
          )}
        </div>

        {/* 盲品挑战评分卡（仅挑战模式展示） */}
        {challengeResult && (
          <div
            data-testid="challenge-result-card"
            className="mx-4 mt-3 p-3 rounded-xl bg-[#231510] border border-[#E5A93C]/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F5EBD6]">
                {challengeResult.guest.guestName} 的品鉴评分
              </span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i <= challengeResult.stars
                        ? 'text-[#E5A93C] fill-[#E5A93C]'
                        : 'text-[#5A4638]'
                    }`}
                  />
                ))}
                <span className="font-mono-tech text-xs font-bold text-[#E5A93C] ml-1.5">
                  {challengeResult.score}分
                </span>
              </div>
            </div>
            <p className="text-[11.5px] text-[#EBDDC5] mt-1.5 leading-snug">
              {challengeResult.feedback}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {challengeResult.matchedPoints.map((pt) => (
                <span
                  key={pt}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A2F21] text-[#A2E6B8] border border-[#4EA66D]/35"
                >
                  ✓ {pt}
                </span>
              ))}
              {challengeResult.missedPoints.map((pt) => (
                <span
                  key={pt}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#33181C] text-[#F2B1BA] border border-[#A63A4B]/35"
                >
                  · {pt}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 中部：五维风味雷达 + 酒精度 + 配方表 */}
        <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center">
          <div className="col-span-6 flex flex-col items-center justify-center bg-[#120B08]/80 rounded-xl border border-[#C89B54]/20 py-2">
            <FlavorRadarChart flavor={drink.flavor} size={154} theme="dark" />
          </div>

          <div className="col-span-6 flex flex-col gap-2">
            <div className="p-2.5 rounded-xl bg-[#120B08]/90 border border-[#C89B54]/25 flex items-center justify-between">
              <span className="text-[10px] text-[#C7B69C]">预估酒精度</span>
              <span
                data-testid="result-abv"
                className="font-editorial text-xl font-bold text-[#E5A93C]"
              >
                {drink.abv.toFixed(1)}%
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#120B08]/80 border border-[#C89B54]/20 flex flex-col gap-1.5">
              <span className="font-mono-tech text-[9.5px] tracking-widest text-[#C89B54] uppercase">
                RECIPE RATIO
              </span>
              {layers.slice(0, 5).map((layer) => (
                <div key={layer.ingredientId} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-[#E6D9C3] truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="truncate max-w-[78px]">{layer.name}</span>
                  </span>
                  <span className="font-mono-tech text-[10px] text-[#C89B54] shrink-0">
                    {layer.ml}ml
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部动作栏 */}
        <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="save-cabinet-btn"
              onClick={onSaveToCabinet}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                isSaved
                  ? 'bg-[#1D2D22] border-[#5BB974]/60 text-[#B4F0C2]'
                  : 'bg-[#251812] border-[#C89B54]/45 text-[#F5EBD6] hover:border-[#E5A93C]'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-4 h-4" />
                  已收藏进酒柜
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-[#E5A93C]" />
                  收藏进酒柜
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="export-poster-btn"
              onClick={onGeneratePoster}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#8F1D2C] to-[#B0283A] text-[#F5EBD6] border border-[#E5A93C]/65 shadow-md active:scale-95 transition"
            >
              <FileImage className="w-4 h-4 text-[#E5A93C]" />
              生成特调海报
            </button>
          </div>

          <button
            type="button"
            onClick={onMakeAnother}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs text-[#C7B69C] hover:text-[#F5EBD6] bg-[#140C09] border border-[#C89B54]/20 active:scale-95 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            调制下一杯特调
          </button>
        </div>
      </div>
    </div>
  );
};
