import { useEffect, useRef, useState } from 'react';

/** 数字平滑滚动到目标值（iOS 式 ease-out），只在变化时跑帧 */
export function useAnimatedNumber(target: number, durationMs = 480, initial = target): number {
  const [value, setValue] = useState(initial);
  const fromRef = useRef(initial);
  const valueRef = useRef(initial);
  valueRef.current = value;

  useEffect(() => {
    if (Math.abs(target - valueRef.current) < 1e-6) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return undefined;
    }
    fromRef.current = valueRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
