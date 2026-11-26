import React, { useRef, useState } from 'react';
import { Award, BookOpen, FileImage, Lock, Trash2, Wine, X } from 'lucide-react';
import { CLASSIC_RECIPES } from '../data/recipes';
import { GLASS_MAP } from '../data/glasses';
import { SavedCocktail } from '../types';
import { useArmedConfirm } from '../hooks/useArmedConfirm';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useSheetDrag } from '../hooks/useSheetDrag';

interface CabinetDrawerProps {
  cabinet: SavedCocktail[];
  unlockedClassicIds: string[];
  onOpenPoster: (item: SavedCocktail) => void;
  onDeleteItem: (id: string) => void;
  onClose: () => void;
  closing?: boolean;
}

export const CabinetDrawer: React.FC<CabinetDrawerProps> = ({
  cabinet,
  unlockedClassicIds,
  onOpenPoster,
  onDeleteItem,
  onClose,
  closing = false,
}) => {
  const [tab, setTab] = useState<'cabinet' | 'codex'>('cabinet');
  const unlockedCount = unlockedClassicIds.length;
  const totalClassics = CLASSIC_RECIPES.length;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { armedKey, trigger: armDelete } = useArmedConfirm(3000);
  useDialogA11y(panelRef, onClose, !closing);
  const drag = useSheetDrag(panelRef, onClose);

  return (
    <div
      data-testid="cabinet-drawer"
      className={`fixed inset-0 z-40 flex items-end sm:items-center justify-center p-2.5 sm:p-4 ${
        closing ? 'pointer-events-none' : ''
      }`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/75 backdrop-blur-sm ${closing ? 'anim-fade-out' : 'anim-fade-in'}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cabinet-drawer-title"
        tabIndex={-1}
        className={`relative w-full max-w-[410px] h-[82vh] flex flex-col rounded-[22px] bg-[#18100C] border border-[#C89B54]/45 shadow-2xl overflow-hidden will-change-transform ${
          closing ? 'anim-sheet-out' : 'anim-sheet-in'
        }`}
      >
        {/* 顶栏 */}
        <div
          {...drag}
          className="relative px-4 pt-6 pb-3.5 border-b border-[#C89B54]/20 flex items-center justify-between bg-[#211510] touch-none"
        >
          <div className="sheet-grabber absolute top-2 left-1/2 -translate-x-1/2" aria-hidden="true" />
          <div>
            <h2 id="cabinet-drawer-title" className="font-editorial text-lg font-bold text-[#F5EBD6]">
              我的酒柜
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭酒柜"
            className="w-8 h-8 rounded-full bg-[#120B08] border border-[#C89B54]/30 flex items-center justify-center text-[#C7B69C] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div
          role="tablist"
          aria-label="酒柜分栏"
          className="grid grid-cols-2 gap-2 px-4 py-2.5 bg-[#140D0A] border-b border-[#C89B54]/15"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cabinet'}
            data-testid="tab-my-cabinet"
            onClick={() => setTab('cabinet')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'cabinet'
                ? 'bg-[#8F1D2C] text-[#F5EBD6] border border-[#E5A93C]/50'
                : 'bg-[#1D130F] text-[#B8A690] border border-[#C89B54]/20'
            }`}
          >
            <Wine className="w-3.5 h-3.5" />
            收藏 ({cabinet.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'codex'}
            data-testid="tab-classic-codex"
            onClick={() => setTab('codex')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'codex'
                ? 'bg-[#8F1D2C] text-[#F5EBD6] border border-[#E5A93C]/50'
                : 'bg-[#1D130F] text-[#B8A690] border border-[#C89B54]/20'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            图鉴 ({unlockedCount}/{totalClassics})
          </button>
        </div>

        {/* 内容列表 */}
        <div key={tab} role="tabpanel" className="flex-1 overflow-y-auto overscroll-contain no-scrollbar p-3.5 anim-fade-in">
          {tab === 'cabinet' ? (
            cabinet.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-12 text-[#A89680]">
                <Wine className="w-10 h-10 text-[#C89B54]/40" />
                <p className="text-sm text-[#E6D9C3]">还没有收藏</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {cabinet.map((item, idx) => (
                  <div
                    key={item.id}
                    data-testid="cabinet-item"
                    style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                    className="anim-row-in p-3 rounded-xl bg-[#221611] border border-[#C89B54]/25 flex items-center gap-3"
                  >
                    <div
                      className="w-11 h-11 rounded-xl shrink-0 border border-white/20 flex items-center justify-center shadow-inner"
                      style={{
                        background: `radial-gradient(circle at 35% 30%, ${item.blendedColor}, #140B08)`,
                      }}
                    >
                      <span className="font-mono-tech text-[10px] font-bold text-white drop-shadow">
                        {item.abv.toFixed(0)}°
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#F5EBD6] truncate">
                          {item.name}
                        </span>
                        {item.isClassic && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#8F1D2C] text-[#F5EBD6] shrink-0">
                            经典
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-[#C89B54] font-mono-tech mt-0.5">
                        {item.serialNo} · {GLASS_MAP[item.glassId]?.name} · {item.abv.toFixed(1)}% ABV
                      </div>
                      <p className="text-[10.5px] text-[#A89680] truncate mt-0.5">
                        {item.bartenderNote}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenPoster(item)}
                        aria-label={`生成「${item.name}」的海报`}
                        className="p-2 rounded-lg bg-[#160E0B] border border-[#C89B54]/30 text-[#E5A93C] hover:border-[#E5A93C] active:scale-95"
                      >
                        <FileImage className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid="cabinet-delete-btn"
                        onClick={() => {
                          if (armDelete(item.id)) onDeleteItem(item.id);
                        }}
                        aria-label={
                          armedKey === item.id
                            ? `再次点击确认删除「${item.name}」`
                            : `删除收藏「${item.name}」（需二次确认）`
                        }
                        className={`p-2 rounded-lg border active:scale-95 flex items-center gap-1 transition ${
                          armedKey === item.id
                            ? 'bg-[#8F1D2C] border-[#F2B5BD] text-white'
                            : 'bg-[#160E0B] border-[#8F1D2C]/35 text-[#E88A96] hover:text-white'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        {armedKey === item.id && (
                          <span className="text-[10px] font-semibold whitespace-nowrap">确认删除</span>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {CLASSIC_RECIPES.map((recipe) => {
                const unlocked = unlockedClassicIds.includes(recipe.id);
                return (
                  <div
                    key={recipe.id}
                    data-testid="codex-card"
                    data-unlocked={unlocked}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                      unlocked
                        ? 'bg-gradient-to-br from-[#2B1914] to-[#1A100D] border-[#E5A93C]/55'
                        : 'bg-[#140D0A] border-[#C89B54]/18 opacity-85'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="text-xs font-bold text-[#F5EBD6]">
                          {unlocked ? recipe.name : '神秘经典配方'}
                        </div>
                        <div className="font-mono-tech text-[9.5px] text-[#C89B54] mt-0.5">
                          {unlocked ? recipe.enName : recipe.era}
                        </div>
                      </div>
                      {unlocked ? (
                        <Award className="w-4 h-4 text-[#E5A93C] shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-[#8A745C] shrink-0" />
                      )}
                    </div>

                    <p className="text-[10.5px] leading-snug text-[#C7B69C]">
                      {unlocked ? recipe.story : `线索：${recipe.hint}`}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1 border-t border-[#C89B54]/15">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: unlocked ? recipe.accentColor : '#4B3A2E',
                        }}
                      />
                      <span className="text-[9.5px] text-[#A89680]">
                        {unlocked ? '已解锁配方' : '待调制解锁'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
