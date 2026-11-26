import React, { useEffect, useState } from 'react';

interface PresenceProps<T> {
  /** 为真值时展示；变为假值后保留最后一次内容播放退场动画，再卸载 */
  value: T | null | undefined | false;
  exitMs?: number;
  children: (value: T, closing: boolean) => React.ReactNode;
}

/** 退场动画容器：避免弹窗/浮层「啪」地一下消失 */
export function Presence<T>({ value, exitMs = 300, children }: PresenceProps<T>) {
  const [rendered, setRendered] = useState<T | null>(value ? (value as T) : null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (value) {
      setRendered(value as T);
      setClosing(false);
      return undefined;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(null);
      setClosing(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [value, exitMs]);

  const current = value ? (value as T) : rendered;
  if (current === null || current === undefined) return null;
  return <>{children(current, !value && closing)}</>;
}
