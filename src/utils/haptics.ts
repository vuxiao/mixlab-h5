/** 轻触觉反馈（Android Chrome 等支持 Vibration API 的设备；iOS Safari 自动忽略） */
let lastAt = 0;

export function haptic(pattern: number | number[], minGapMs = 40): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  if (now - lastAt < minGapMs) return;
  lastAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}
