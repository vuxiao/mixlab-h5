import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 二次确认：第一次点击「上膛」，在 timeoutMs 内再次点击才真正执行。
 * 适合删除、清空这类一键不可逆的危险操作。
 */
export function useArmedConfirm(timeoutMs = 2800) {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const disarm = useCallback(() => {
    clearTimer();
    setArmedKey(null);
  }, []);

  /** 返回 true 表示本次点击应当执行危险操作 */
  const trigger = useCallback(
    (key: string): boolean => {
      if (armedKey === key) {
        disarm();
        return true;
      }
      clearTimer();
      setArmedKey(key);
      timerRef.current = window.setTimeout(() => setArmedKey(null), timeoutMs);
      return false;
    },
    [armedKey, disarm, timeoutMs]
  );

  return { armedKey, trigger, disarm };
}
