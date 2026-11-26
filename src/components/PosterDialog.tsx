import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Share2, X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';
import type { PosterImage } from '../engine/posterGenerator';
import { describeShareOutcome, isWeChat, savePosterImage } from '../utils/share';
import type { ToastTone } from './Toast';

interface PosterDialogProps {
  testIds: { root: string; img: string; save: string };
  zClass: string;
  title: string;
  closeLabel: string;
  imgAlt: string;
  loadingText: string;
  errorText: string;
  saveLabel: string;
  filename: string;
  generate: () => Promise<PosterImage>;
  onClose: () => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
  closing?: boolean;
}

/** 海报预览 + 保存/分享通用弹窗（品鉴海报与官方邀请函共用） */
export const PosterDialog: React.FC<PosterDialogProps> = ({
  testIds,
  zClass,
  title,
  closeLabel,
  imgAlt,
  loadingText,
  errorText,
  saveLabel,
  filename,
  generate,
  onClose,
  onNotify,
  closing = false,
}) => {
  const [poster, setPoster] = useState<PosterImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useDialogA11y(panelRef, onClose, !closing);

  const inWeChat = isWeChat();

  useEffect(() => {
    let cancelled = false;
    setPoster(null);
    setError(null);
    generateRef
      .current()
      .then((img) => {
        if (!cancelled) setPoster(img);
      })
      .catch(() => {
        if (!cancelled) setError(errorText);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, errorText]);

  const handleSave = async () => {
    if (!poster || saving) return;
    setSaving(true);
    try {
      const outcome = await savePosterImage(poster, filename, title);
      const msg = describeShareOutcome(outcome);
      if (msg) onNotify?.(msg, outcome === 'downloaded' ? 'success' : 'info');
    } catch {
      onNotify?.('保存失败，请长按海报保存', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid={testIds.root}
      className={`fixed inset-0 ${zClass} flex items-center justify-center p-3 ${closing ? 'pointer-events-none' : ''}`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/85 backdrop-blur-md ${closing ? 'anim-fade-out' : 'anim-fade-in'}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIds.root}-title`}
        tabIndex={-1}
        className={`relative w-full max-w-[390px] max-h-[94vh] flex flex-col items-center gap-2.5 ${
          closing ? 'anim-pop-out' : 'anim-pop-in'
        }`}
      >
        <div className="w-full flex items-center justify-between gap-2 px-1">
          <h2
            id={`${testIds.root}-title`}
            className="font-editorial text-sm text-[#F5EBD6] tracking-wide truncate"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="w-8 h-8 rounded-full bg-[#1F140F] border border-[#C89B54]/40 flex items-center justify-center text-[#F5EBD6] shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-xl border border-[#C89B54]/40 bg-[#120B08]">
          {poster ? (
            <img
              data-testid={testIds.img}
              src={poster.dataUrl}
              alt={imgAlt}
              data-recipe-rows={poster.meta?.recipeRows}
              data-recipe-ingredients={poster.meta?.recipeIngredients}
              data-percent-total={poster.meta?.percentTotal}
              draggable
              className="allow-save anim-fade-in max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl"
            />
          ) : error ? (
            <div className="py-14 flex flex-col items-center gap-3 text-xs text-[#F2B1BA]">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="px-3 py-1.5 rounded-full border border-[#C89B54]/45 text-[#F5EBD6] flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                重新生成
              </button>
            </div>
          ) : (
            <div role="status" className="py-20 flex flex-col items-center gap-2 text-[#C89B54]">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
              <span className="text-xs">{loadingText}</span>
            </div>
          )}
        </div>

        <div className="w-full flex flex-col gap-1.5">
          {inWeChat ? (
            <div
              data-testid={testIds.save}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#E5A93C] to-[#C88928] text-[#120B08] font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              长按海报保存或分享
            </div>
          ) : (
            <button
              type="button"
              data-testid={testIds.save}
              data-autofocus
              disabled={!poster || saving}
              onClick={handleSave}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#E5A93C] to-[#C88928] text-[#120B08] font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50 active:scale-95 transition"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                <Share2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              {saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
