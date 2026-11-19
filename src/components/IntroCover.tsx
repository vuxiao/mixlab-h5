import React from 'react';
import { ArrowRight, QrCode, Sparkles } from 'lucide-react';

interface IntroCoverProps {
  onEnterBar: () => void;
  onEnterChallenge: () => void;
  onOpenBrandPoster: () => void;
}

const FEATURES = [
  {
    roman: 'I',
    title: '四步沉浸调酒',
    desc: '3 款水晶杯 × 手凿冰球 × 16 种基酒辅料真实密度分层',
  },
  {
    roman: 'II',
    title: '风味演算与经典图鉴',
    desc: '实时 ABV 度数、五维风味雷达与 12 款隐藏经典酒谱',
  },
  {
    roman: 'III',
    title: '微醺盲品客单',
    desc: '接待深夜神秘酒客，定制特调赢取星级品鉴',
  },
];

export const IntroCover: React.FC<IntroCoverProps> = ({
  onEnterBar,
  onEnterChallenge,
  onOpenBrandPoster,
}) => {
  return (
    <div
      data-testid="intro-cover"
      className="fixed inset-0 z-50 flex justify-center items-stretch bg-[#0A0604]"
    >
      <div className="speakeasy-grain animate-cover-in relative w-full max-w-[430px] h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-b from-[#1B0E0C] via-[#120A08] to-[#0D0705] p-3 safe-top safe-bottom">
        {/* 丝绒酒红与琥珀霓虹氛围光斑 */}
        <div
          className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-45"
          style={{
            background: 'radial-gradient(circle, rgba(168,36,54,0.52) 0%, rgba(229,169,60,0.16) 52%, transparent 74%)',
          }}
        />

        {/* 双层古铜烫金细线外框 */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between rounded-2xl border border-[#C89B54]/55 p-1.5 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]">
          <div className="relative flex-1 min-h-0 flex flex-col justify-between rounded-xl border border-[#C89B54]/28 px-4 py-3.5 bg-[#120B08]/55 backdrop-blur-[2px] overflow-y-auto no-scrollbar">
            {/* 四角 Art Deco 烫金角饰 */}
            <span className="pointer-events-none absolute top-2 left-2 w-3 h-3 border-t border-l border-[#E5A93C]/70" />
            <span className="pointer-events-none absolute top-2 right-2 w-3 h-3 border-t border-r border-[#E5A93C]/70" />
            <span className="pointer-events-none absolute bottom-2 left-2 w-3 h-3 border-b border-l border-[#E5A93C]/70" />
            <span className="pointer-events-none absolute bottom-2 right-2 w-3 h-3 border-b border-r border-[#E5A93C]/70" />

            {/* 顶部刊头 */}
            <div className="flex items-center justify-between border-b border-[#C89B54]/22 pb-2 shrink-0">
              <span className="font-mono-tech text-[9.5px] tracking-[0.2em] text-[#E5A93C] uppercase">
                EST. 2026 · SPEAKEASY DIGITAL BAR
              </span>
              <span className="font-mono-tech text-[9px] px-1.5 py-0.5 rounded border border-[#C89B54]/40 text-[#F5EBD6]/85">
                NO.01
              </span>
            </div>

            {/* 中央主视觉：发光水晶鸡尾酒杯 + 手凿大冰球 + 升腾气泡 */}
            <div className="flex flex-col items-center justify-center my-1.5 shrink-0">
              <div className="relative w-36 h-40 flex items-center justify-center">
                <div
                  className="pointer-events-none absolute w-32 h-32 rounded-full blur-2xl opacity-55"
                  style={{
                    background: 'radial-gradient(circle, rgba(229,145,56,0.58) 0%, rgba(143,29,44,0.3) 55%, transparent 75%)',
                  }}
                />
                <svg
                  viewBox="0 0 180 190"
                  className="relative z-10 w-full h-full drop-shadow-[0_12px_20px_rgba(0,0,0,0.75)]"
                  aria-label="微醺研究所封面水晶酒杯插画"
                >
                  <defs>
                    <clipPath id="introGlassClip">
                      <path d="M 46 52 L 134 52 L 126 144 L 54 144 Z" />
                    </clipPath>
                    <linearGradient id="introLiquidGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#8F1828" stopOpacity="0.96" />
                      <stop offset="48%" stopColor="#D65A28" stopOpacity="0.92" />
                      <stop offset="100%" stopColor="#F5B84B" stopOpacity="0.88" />
                    </linearGradient>
                    <radialGradient id="introSphereGrad" cx="32%" cy="28%" r="68%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.94" />
                      <stop offset="38%" stopColor="#E6F6FF" stopOpacity="0.48" />
                      <stop offset="78%" stopColor="#A9D6F0" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.66" />
                    </radialGradient>
                  </defs>

                  {/* 吧台光弧与黄铜杯垫 */}
                  <path d="M 10 157 Q 90 148 170 157" fill="none" stroke="#C89B54" strokeOpacity="0.32" strokeWidth="1" />
                  <ellipse cx="90" cy="162" rx="48" ry="7.5" fill="#1E120C" stroke="#E5A93C" strokeOpacity="0.65" strokeWidth="1.4" />
                  <ellipse cx="90" cy="162" rx="40" ry="5" fill="none" stroke="#E5A93C" strokeOpacity="0.35" strokeDasharray="3 3" />

                  {/* 迷迭香与烟熏橙皮 */}
                  <g transform="translate(110, 48) rotate(14)">
                    <line x1="0" y1="22" x2="0" y2="-28" stroke="#629459" strokeWidth="2.2" strokeLinecap="round" />
                    {[-22, -14, -6, 2].map((y) => (
                      <g key={y}>
                        <line x1="0" y1={y} x2="-7" y2={y - 5} stroke="#7DB872" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="0" y1={y} x2="7" y2={y - 5} stroke="#699E5F" strokeWidth="1.5" strokeLinecap="round" />
                      </g>
                    ))}
                  </g>

                  {/* 杯内琥珀分层酒液 + 手凿大冰球 + 动态升腾气泡 */}
                  <g clipPath="url(#introGlassClip)">
                    <rect x="42" y="76" width="96" height="72" fill="url(#introLiquidGrad)" />
                    <ellipse cx="90" cy="76" rx="40" ry="4" fill="#FFF7DE" opacity="0.3" />

                    {/* 外层定位 + 内层漂浮大冰球 */}
                    <g transform="translate(90, 114)">
                      <g className="animate-gentle-float">
                        <circle r="22" fill="url(#introSphereGrad)" stroke="#FFFFFF" strokeOpacity="0.86" strokeWidth="1.4" />
                        <path
                          d="M -12 -5 A 14 14 0 0 1 4 -14"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          opacity="0.9"
                        />
                        <path
                          d="M -7 3 L 0 -3 L 8 1"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="0.9"
                          opacity="0.48"
                        />
                      </g>
                    </g>

                    {/* 动态上升琥珀微气泡 */}
                    <circle cx="67" cy="126" r="2.1" fill="#FFF5D6" className="animate-intro-bubble" style={{ animationDelay: '0s' }} />
                    <circle cx="112" cy="130" r="1.7" fill="#FFF5D6" className="animate-intro-bubble" style={{ animationDelay: '0.9s' }} />
                    <circle cx="80" cy="134" r="1.5" fill="#FFE6A8" className="animate-intro-bubble" style={{ animationDelay: '1.7s' }} />
                    <circle cx="101" cy="128" r="2.2" fill="#FFF5D6" className="animate-intro-bubble" style={{ animationDelay: '2.3s' }} />
                  </g>

                  {/* 烟熏橙皮卷 */}
                  <path
                    d="M 55 54 C 50 34, 76 30, 79 48"
                    fill="none"
                    stroke="#F28F22"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />

                  {/* 厚底水晶古典杯外轮廓 */}
                  <g fill="none" stroke="rgba(245, 235, 214, 0.86)" strokeWidth="2">
                    <path d="M 44 50 L 52 156 L 128 156 L 136 50" />
                    <path d="M 53 144 L 127 144 L 128 155 L 52 155 Z" fill="rgba(245,235,214,0.16)" stroke="none" />
                    <ellipse cx="90" cy="50" rx="46" ry="5" />
                    <line x1="54" y1="64" x2="59" y2="134" stroke="#FFFFFF" strokeOpacity="0.38" strokeWidth="2.8" strokeLinecap="round" />
                  </g>
                </svg>
              </div>

              {/* 粗衬线大标题 + 引言 */}
              <div className="text-center mt-0.5">
                <div className="inline-flex items-center gap-2">
                  <span className="h-[1px] w-6 bg-gradient-to-r from-transparent to-[#E5A93C]" />
                  <span className="font-mono-tech text-[10px] tracking-[0.28em] text-[#E5A93C] uppercase">
                    MIXLAB ATELIER
                  </span>
                  <span className="h-[1px] w-6 bg-gradient-to-l from-transparent to-[#E5A93C]" />
                </div>
                <h1 className="font-editorial text-[34px] font-bold tracking-[0.08em] text-[#F5EBD6] leading-tight mt-0.5 neon-amber-text">
                  微醺研究所
                </h1>
                <p className="text-[12px] text-[#D9C7AE] tracking-wide mt-1">
                  “不必等夜深，指尖倾倒属于你的今夜风味”
                </p>
              </div>
            </div>

            {/* 三栏复古杂志目录式玩法速览 */}
            <div className="flex flex-col gap-2 my-2 shrink-0">
              {FEATURES.map((feat) => (
                <div
                  key={feat.roman}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-[#1A100D]/88 border border-[#C89B54]/24"
                >
                  <span className="font-editorial text-sm font-bold text-[#E5A93C] w-5 text-center shrink-0 pt-0.5">
                    {feat.roman}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-[#F5EBD6] tracking-wide">
                      {feat.title}
                    </div>
                    <p className="text-[10.5px] text-[#B8A690] leading-snug mt-0.5">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* 底部主副 CTA 动作区 */}
            <div className="flex flex-col gap-2 pt-1 shrink-0">
              <button
                type="button"
                data-testid="intro-enter-bar-btn"
                onClick={onEnterBar}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#8F1D2C] via-[#B2293B] to-[#8F1D2C] text-[#F5EBD6] font-bold text-[13.5px] tracking-[0.12em] border border-[#E5A93C]/75 shadow-[0_8px_24px_rgba(143,29,44,0.55)] flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
              >
                <span>推开暗门 · 进入吧台</span>
                <ArrowRight className="w-4 h-4 text-[#E5A93C]" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="intro-enter-challenge-btn"
                  onClick={onEnterChallenge}
                  className="py-2.5 px-2 rounded-xl bg-[#1B110D] border border-[#C89B54]/35 text-[#EBDCC3] text-[11px] font-medium flex items-center justify-center gap-1 hover:border-[#E5A93C] active:scale-[0.98] transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
                  <span>直接挑战盲品客单</span>
                </button>
                <button
                  type="button"
                  data-testid="intro-open-poster-btn"
                  onClick={onOpenBrandPoster}
                  className="py-2.5 px-2 rounded-xl bg-[#1B110D] border border-[#C89B54]/35 text-[#EBDCC3] text-[11px] font-medium flex items-center justify-center gap-1 hover:border-[#E5A93C] active:scale-[0.98] transition"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
                  <span>获取酒馆邀请海报</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
