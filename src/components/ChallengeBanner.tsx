import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ChallengeGuest } from '../types';

interface ChallengeBannerProps {
  guest: ChallengeGuest;
  onNextGuest: () => void;
}

const GuestAvatar: React.FC<{ theme: ChallengeGuest['avatarTheme'] }> = ({ theme }) => {
  const palette: Record<ChallengeGuest['avatarTheme'], { bg: string; accent: string }> = {
    photographer: { bg: '#163042', accent: '#5CD6FF' },
    jazz: { bg: '#3B1822', accent: '#E5A93C' },
    architect: { bg: '#202826', accent: '#9AD4B2' },
    illustrator: { bg: '#3B2318', accent: '#F29446' },
    chef: { bg: '#2F1F2E', accent: '#F2A3C7' },
    poet: { bg: '#1D2236', accent: '#B6C4FF' },
    dj: { bg: '#2B1533', accent: '#E85D75' },
    editor: { bg: '#38151F', accent: '#F59BB2' },
  };
  const colors = palette[theme] ?? palette.jazz;

  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="w-9 h-9 rounded-full shrink-0 border border-[#C89B54]/50">
      <rect width="40" height="40" fill={colors.bg} />
      <circle cx="20" cy="15" r="6.5" fill="#F5EBD6" opacity="0.92" />
      <path d="M 8 36 C 10 26, 30 26, 32 36" fill={colors.accent} opacity="0.88" />
      <circle cx="17.8" cy="14.5" r="1" fill="#1A110D" />
      <circle cx="22.2" cy="14.5" r="1" fill="#1A110D" />
      <path d="M 18 18 Q 20 19.8 22 18" stroke="#1A110D" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
};

export const ChallengeBanner: React.FC<ChallengeBannerProps> = ({ guest, onNextGuest }) => {
  return (
    <div
      data-testid="challenge-banner"
      className="mx-3 mt-1.5 p-2.5 rounded-xl editorial-card relative overflow-hidden shrink-0"
    >
      <div className="flex items-start gap-2.5">
        <GuestAvatar theme={guest.avatarTheme} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-[#E5A93C] truncate shrink-0 max-w-[60%]">
                {guest.guestName}
              </span>
              {/* 客人人设（旧版用了不存在的 xs 断点导致永远隐藏） */}
              <span
                data-testid="guest-persona"
                className="text-[9.5px] text-[#B8A690] truncate min-w-0"
                title={guest.persona}
              >
                · {guest.persona}
              </span>
            </div>
            <button
              type="button"
              data-testid="next-guest-btn"
              aria-label="换一位客人的订单"
              onClick={onNextGuest}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#160E0B] border border-[#C89B54]/35 text-[#E6D9C3] hover:border-[#E5A93C] active:scale-95 transition shrink-0"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              换一单
            </button>
          </div>
          <p className="text-[11.5px] text-[#F5EBD6] leading-snug mt-1">{guest.quote}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {guest.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9.5px] bg-[#8F1D2C]/35 border border-[#C89B54]/30 text-[#F5D8A8]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
