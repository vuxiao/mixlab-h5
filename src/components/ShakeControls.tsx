import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Sparkles, Waves } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface ShakeControlsProps {
  totalMl: number;
  shakeProgress: number;
  isShaking: boolean;
  onShakeBoost: (delta: number) => void;
  onSetShaking: (shaking: boolean) => void;
  onServeLayered: () => void;
  onBackToPour: () => void;
}

type MotionStatus = 'idle' | 'listening' | 'denied' | 'unsupported';

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export const ShakeControls: React.FC<ShakeControlsProps> = ({
  totalMl,
  shakeProgress,
  isShaking,
  onShakeBoost,
  onSetShaking,
  onServeLayered,
  onBackToPour,
}) => {
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('idle');
  const [motionHint, setMotionHint] = useState<string>('');
  const holdIntervalRef = useRef<number | null>(null);
  const lastShakeTsRef = useRef<number>(0);

  const canMix = totalMl >= APP_CONFIG.minServeMl;

  // 监听手机摇一摇加速度事件
  useEffect(() => {
    if (motionStatus !== 'listening' || !canMix) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;
      const magnitude = Math.sqrt(
        (acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2
      );
      const now = Date.now();
      if (magnitude > 16.5 && now - lastShakeTsRef.current > 180) {
        lastShakeTsRef.current = now;
        onSetShaking(true);
        onShakeBoost(18);
        window.setTimeout(() => onSetShaking(false), 320);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [motionStatus, canMix, onShakeBoost, onSetShaking]);

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    };
  }, []);

  const requestMotionPermission = async () => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setMotionStatus('unsupported');
      setMotionHint('当前设备不支持陀螺仪，请使用下方按钮长按或连点摇匀');
      return;
    }

    const DME = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
    if (typeof DME.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission();
        if (result === 'granted') {
          setMotionStatus('listening');
          setMotionHint('已开启摇一摇！握紧手机轻摇即可调匀');
        } else {
          setMotionStatus('denied');
          setMotionHint('未获得运动传感器权限，可直接使用下方按钮摇匀');
        }
      } catch {
        setMotionStatus('denied');
        setMotionHint('请在 HTTPS 手机端授权运动权限，或使用下方按钮摇匀');
      }
    } else {
      setMotionStatus('listening');
      setMotionHint('摇一摇感应已就绪！轻摇手机或长按下方按钮');
    }
  };

  const stopHoldShake = () => {
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    onSetShaking(false);
  };

  const startHoldShake = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!canMix) return;
    stopHoldShake();
    onSetShaking(true);
    onShakeBoost(16);
    holdIntervalRef.current = window.setInterval(() => {
      onShakeBoost(10);
    }, 95);
  };

  if (!canMix) {
    return (
      <div className="flex flex-col items-center justify-center py-5 text-center gap-2.5">
        <p className="text-xs text-[#C7B69C]">
          酒杯中还至少需要 <span className="font-mono-tech text-[#E5A93C]">{APP_CONFIG.minServeMl}ml</span> 酒液才能摇匀出酒
        </p>
        <button
          type="button"
          onClick={onBackToPour}
          className="px-5 py-2 rounded-full bg-[#8F1D2C] text-[#F5EBD6] text-xs font-semibold border border-[#E5A93C]/45 active:scale-95 transition"
        >
          返回吧台倒酒
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* 摇匀融合进度条 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#C7B69C] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#E5A93C]" />
            摇匀融合度 · {shakeProgress >= 100 ? '完美呈现' : isShaking ? '正在剧烈摇晃…' : '等待摇晃'}
          </span>
          <span data-testid="shake-progress-text" className="font-mono-tech font-bold text-[#E5A93C]">
            {Math.min(100, Math.round(shakeProgress))}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-[#160E0B] border border-[#C89B54]/25 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#8F1D2C] via-[#E85D4A] to-[#E5A93C] transition-all duration-150"
            style={{ width: `${Math.min(100, shakeProgress)}%` }}
          />
        </div>
      </div>

      {/* 主操作区：长按/连点兜底大按钮 */}
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          data-testid="shake-action-btn"
          onPointerDown={startHoldShake}
          onPointerUp={stopHoldShake}
          onPointerLeave={stopHoldShake}
          onPointerCancel={stopHoldShake}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative w-full py-3.5 rounded-xl font-semibold text-sm tracking-wider touch-none transition-all border ${
            isShaking
              ? 'bg-gradient-to-r from-[#A92436] via-[#C83D47] to-[#E5A93C] text-[#120B08] border-[#FFF3D1] shadow-[0_0_24px_rgba(229,169,60,0.45)] scale-[0.98]'
              : 'bg-gradient-to-r from-[#8F1D2C] via-[#A92638] to-[#8F1D2C] text-[#F5EBD6] border-[#E5A93C]/65 shadow-[0_6px_18px_rgba(143,29,44,0.45)] active:scale-[0.98]'
          }`}
        >
          {isShaking ? '✦ 摇晃融合中 · 松手暂停 ✦' : '长按摇晃 / 连点摇匀出酒'}
        </button>

        {/* 双副按钮：手机摇一摇权限 + 保留分层直接出酒 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={requestMotionPermission}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-medium border transition active:scale-95 ${
              motionStatus === 'listening'
                ? 'bg-[#1D2A1F] border-[#5BB974]/60 text-[#B4F0C2]'
                : 'bg-[#1A110D] border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
            <span>{motionStatus === 'listening' ? '摇一摇已开启' : '开启手机摇一摇'}</span>
          </button>

          <button
            type="button"
            data-testid="serve-layered-btn"
            onClick={onServeLayered}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-medium bg-[#1A110D] border border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/60 active:scale-95 transition"
          >
            <Waves className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
            <span>保留分层直接出酒</span>
          </button>
        </div>
      </div>

      {motionHint && (
        <p className="text-[10px] text-center text-[#C89B54]/90 leading-snug">{motionHint}</p>
      )}
    </div>
  );
};
