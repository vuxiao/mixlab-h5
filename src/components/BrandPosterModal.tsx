import React, { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { generateBrandIntroPosterDataUrl } from '../engine/posterGenerator';

interface BrandPosterModalProps {
  onClose: () => void;
}

export const BrandPosterModal: React.FC<BrandPosterModalProps> = ({ onClose }) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPosterUrl(null);
    setError(null);

    generateBrandIntroPosterDataUrl()
      .then((url) => {
        if (!cancelled) setPosterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError('邀请函海报生成失败，请重试');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = () => {
    if (!posterUrl) return;
    const link = document.createElement('a');
    link.href = posterUrl;
    link.download = 'MixLab-微醺研究所-官方邀请函海报.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      data-testid="brand-poster-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/88 backdrop-blur-md p-3"
    >
      <div className="w-full max-w-[390px] max-h-[94vh] flex flex-col items-center gap-2.5 animate-sheet-up">
        <div className="w-full flex items-center justify-between px-1">
          <span className="font-editorial text-sm text-[#F5EBD6] tracking-wide">
            微醺研究所 · 官方邀请函二维码海报
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭官方邀请海报"
            className="w-8 h-8 rounded-full bg-[#1F140F] border border-[#C89B54]/40 flex items-center justify-center text-[#F5EBD6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-xl border border-[#C89B54]/45 bg-[#120B08]">
          {posterUrl ? (
            <img
              data-testid="brand-poster-preview-img"
              src={posterUrl}
              alt="微醺研究所 MixLab 官方产品介绍二维码海报"
              className="max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl select-auto"
            />
          ) : error ? (
            <div className="py-16 text-xs text-[#F2B1BA]">{error}</div>
          ) : (
            <div className="py-20 flex flex-col items-center gap-2 text-[#C89B54]">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">正在烫金印制官方邀请函海报…</span>
            </div>
          )}
        </div>

        <div className="w-full flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="download-brand-poster-btn"
            disabled={!posterUrl}
            onClick={handleDownload}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#E5A93C] to-[#C88928] text-[#120B08] font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50 active:scale-95 transition"
          >
            <Download className="w-4 h-4" />
            保存高清产品邀请函海报 PNG
          </button>
          <p className="text-[10px] text-center text-[#B8A690]">
            集酒馆介绍与公网直达二维码于一体 · 手机端可直接长按保存分享
          </p>
        </div>
      </div>
    </div>
  );
};
