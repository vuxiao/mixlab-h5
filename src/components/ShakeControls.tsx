import React, { useEffect, useRef, useState } from 'react';
import { Eye, RotateCcw, Smartphone, Sparkles, Waves } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface ShakeControlsProps {
  totalMl: number;
  shakeProgress: number;
  isShaking: boolean;
  onShakeBoost: (delta: number) => void;
  onSetShaking: (shaking: boolean) => void;
  onServeLayered: () => void;
  onBackToPour: () => void;
  /** 本杯已出酒时的编号；非空则锁定出酒，避免同一杯重复占用编号 */
  servedSerialNo: string | null;
  onReopenResult: () => void;
  onMakeAnother: () => void;
}

type MotionStatus = 'idle' | 'probing' | 'listening' | 'denied' | 'unsupported';

/** 桌面浏览器虽有 DeviceMotionEvent，但不会派发带数据的事件；探测这么久收不到就判定无传感器 */
const MOTION_PROBE_MS = 1200;

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
  servedSerialNo,
  onReopenResult,
  onMakeAnother,
}) => {
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('idle');
  const [motionHint, setMotionHint] = useState<string>('');
  const holdIntervalRef = useRef<number | null>(null);
  const keyShakeTimerRef = useRef<number | null>(null);
  const motionShakeTimerRef = useRef<number | null>(null);
  const lastShakeTsRef = useRef<number>(0);
  const probeCleanupRef = useRef<(() => void) | null>(null);

  const canMix = totalMl >= APP_CONFIG.minServeMl;
  const isServed = Boolean(servedSerialNo);

  // 监听手机摇一摇加速度事件
  useEffect(() => {
    if (motionStatus !== 'listening' || !canMix || isServed) return;

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
        if (motionShakeTimerRef.current !== null) window.clearTimeout(motionShakeTimerRef.current);
        motionShakeTimerRef.current = window.setTimeout(() => onSetShaking(false), 320);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [motionStatus, canMix, isServed, onShakeBoost, onSetShaking]);

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
      if (keyShakeTimerRef.current !== null) window.clearTimeout(keyShakeTimerRef.current);
      if (motionShakeTimerRef.current !== null) window.clearTimeout(motionShakeTimerRef.current);
      probeCleanupRef.current?.();
      onSetShaking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 出酒后停止一切摇晃
  useEffect(() => {
    if (isServed && holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
      onSetShaking(false);
    }
  }, [isServed, onSetShaking]);

  /** 真实探测传感器：只有收到带加速度数据的 devicemotion 事件才算就绪 */
  const probeMotionSensor = () => {
    probeCleanupRef.current?.();
    setMotionStatus('probing');
    setMotionHint('');

    let settled = false;
    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc || (acc.x == null && acc.y == null && acc.z == null)) return;
      finish(true);
    };
    const timer = window.setTimeout(() => finish(false), MOTION_PROBE_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('devicemotion', onMotion);
      probeCleanupRef.current = null;
    };
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) {
        setMotionStatus('listening');
        setMotionHint('');
      } else {
        setMotionStatus('unsupported');
        setMotionHint('未检测到运动传感器，请用按钮摇匀');
      }
    }
    probeCleanupRef.current = cleanup;
    window.addEventListener('devicemotion', onMotion);
  };

  const requestMotionPermission = async () => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setMotionStatus('unsupported');
      setMotionHint('未检测到运动传感器，请用按钮摇匀');
      return;
    }

    const DME = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
    if (typeof DME.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission();
        if (result === 'granted') {
          probeMotionSensor();
        } else {
          setMotionStatus('denied');
          setMotionHint('未获授权，请用按钮摇匀');
        }
      } catch {
        setMotionStatus('denied');
        setMotionHint('未获授权，请用按钮摇匀');
      }
    } else {
      probeMotionSensor();
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
    if (!canMix || isServed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopHoldShake();
    onSetShaking(true);
    onShakeBoost(16);
    holdIntervalRef.current = window.setInterval(() => {
      onShakeBoost(10);
    }, 95);
  };

  /** 键盘 Enter/Space：每按一次摇一下（按住 Enter 会自动连发） */
  const handleKeyboardShake = (e: React.MouseEvent) => {
    if (e.detail !== 0 || !canMix || isServed) return;
    onSetShaking(true);
    onShakeBoost(20);
    if (keyShakeTimerRef.current !== null) window.clearTimeout(keyShakeTimerRef.current);
    keyShakeTimerRef.current = window.setTimeout(() => onSetShaking(false), 360);
  };

  if (!canMix) {
    return (
      <div className="flex flex-col items-center justify-center py-5 text-center gap-2.5">
        <p className="text-xs text-[#C7B69C]">
          至少倒入 <span className="font-mono-tech text-[#E5A93C]">{APP_CONFIG.minServeMl}ml</span>
        </p>
        <button
          type="button"
          onClick={onBackToPour}
          className="px-5 py-2 rounded-full bg-[#8F1D2C] text-[#F5EBD6] text-xs font-semibold border border-[#E5A93C]/45 active:scale-95 transition"
        >
          去倒酒
        </button>
      </div>
    );
  }

  if (isServed) {
    return (
      <div
        data-testid="served-lock-panel"
        className="flex flex-col items-center justify-center py-3 text-center gap-2.5"
      >
        <p className="text-xs text-[#C7B69C]">
          已出酒 · <span className="font-mono-tech text-[#E5A93C]">{servedSerialNo}</span>
        </p>
        <div className="w-full grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="reopen-result-btn"
            onClick={onReopenResult}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#8F1D2C] to-[#A82738] text-[#F5EBD6] border border-[#E5A93C]/55 active:scale-95 transition"
          >
            <Eye className="w-3.5 h-3.5 text-[#E5A93C]" aria-hidden="true" />
            查看品鉴卡
          </button>
          <button
            type="button"
            onClick={onMakeAnother}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-[#1A110D] border border-[#C89B54]/30 text-[#D8C7AF] active:scale-95 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#E5A93C]" aria-hidden="true" />
            调制下一杯
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.min(100, Math.round(shakeProgress));

  return (
    <div className="flex flex-col gap-2.5">
      {/* 摇匀融合进度条 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#C7B69C] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#E5A93C]" />
            摇匀度
          </span>
          <span
            data-testid="shake-progress-text"
            aria-live="polite"
            className="font-mono-tech font-bold text-[#E5A93C]"
          >
            {progressPct}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="摇匀融合度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          className="h-2 rounded-full bg-[#160E0B] border border-[#C89B54]/25 overflow-hidden"
        >
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
          onClick={handleKeyboardShake}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative w-full py-3.5 rounded-xl font-semibold text-sm tracking-wider touch-none transition-all border ${
            isShaking
              ? 'bg-gradient-to-r from-[#A92436] via-[#C83D47] to-[#E5A93C] text-[#120B08] border-[#FFF3D1] shadow-[0_0_24px_rgba(229,169,60,0.45)] scale-[0.98]'
              : 'bg-gradient-to-r from-[#8F1D2C] via-[#A92638] to-[#8F1D2C] text-[#F5EBD6] border-[#E5A93C]/65 shadow-[0_6px_18px_rgba(143,29,44,0.45)] active:scale-[0.98]'
          }`}
        >
          {isShaking ? '摇晃中…' : '长按摇匀'}
        </button>

        {/* 双副按钮：手机摇一摇权限 + 保留分层直接出酒 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="motion-permission-btn"
            onClick={requestMotionPermission}
            disabled={motionStatus === 'probing'}
            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-medium border transition active:scale-95 ${
              motionStatus === 'listening'
                ? 'bg-[#1D2A1F] border-[#5BB974]/60 text-[#B4F0C2]'
                : 'bg-[#1A110D] border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
            <span>
              {motionStatus === 'listening'
                ? '摇一摇已开启'
                : motionStatus === 'probing'
                ? '检测中…'
                : motionStatus === 'unsupported'
                ? '不支持摇一摇'
                : '摇一摇'}
            </span>
          </button>

          <button
            type="button"
            data-testid="serve-layered-btn"
            onClick={onServeLayered}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-medium bg-[#1A110D] border border-[#C89B54]/30 text-[#D8C7AF] hover:border-[#E5A93C]/60 active:scale-95 transition"
          >
            <Waves className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
            <span>分层出酒</span>
          </button>
        </div>
      </div>

      {motionHint && (
        <p
          data-testid="motion-hint"
          aria-live="polite"
          className="text-[10px] text-center text-[#C89B54]/90 leading-snug"
        >
          {motionHint}
        </p>
      )}
    </div>
  );
};
