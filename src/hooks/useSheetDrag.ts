import { RefObject, useCallback, useRef } from 'react';

/**
 * iOS 式下拉关闭：按住面板顶部把手区域向下拖，跟手位移；
 * 松手时距离或速度足够则顺势滑出关闭，否则弹簧回弹。
 * 小于 6px 的移动视为点击，不影响把手区域内按钮。
 */
export function useSheetDrag(panelRef: RefObject<HTMLElement | null>, onDismiss: () => void) {
  const st = useRef<{ id: number; y0: number; t0: number; dy: number; active: boolean } | null>(null);

  const reset = (el: HTMLElement, animate: boolean) => {
    el.style.transition = animate ? 'transform 460ms cubic-bezier(0.32, 0.72, 0, 1)' : '';
    el.style.transform = '';
    if (animate) {
      window.setTimeout(() => {
        el.style.transition = '';
      }, 480);
    }
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = panelRef.current;
      if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (el.scrollTop > 0) return;
      st.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0, active: false };
    },
    [panelRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = st.current;
      const el = panelRef.current;
      if (!s || !el || s.id !== e.pointerId) return;
      const raw = e.clientY - s.y0;
      if (!s.active) {
        if (Math.abs(raw) < 6) return;
        s.active = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      // 向上拖有阻尼（橡皮筋），向下跟手
      s.dy = raw > 0 ? raw : raw * 0.18;
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${s.dy.toFixed(1)}px, 0)`;
    },
    [panelRef]
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const s = st.current;
      const el = panelRef.current;
      st.current = null;
      if (!s || !el || !s.active) return;
      const v = s.dy / Math.max(1, performance.now() - s.t0); // px/ms
      if (s.dy > 110 || (v > 0.55 && s.dy > 24)) {
        el.dataset.dragDismiss = '1';
        el.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 1, 1)';
        el.style.transform = 'translate3d(0, 110%, 0)';
        onDismiss();
      } else {
        reset(el, true);
      }
      e.preventDefault();
    },
    [panelRef, onDismiss]
  );

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
