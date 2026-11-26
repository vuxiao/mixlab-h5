import { RefObject, useEffect, useRef } from 'react';

/**
 * 弹窗无障碍：Esc 关闭 + Tab 焦点锁定 + 打开时聚焦、关闭后还原焦点。
 * 多个弹窗叠加时，只有最上层弹窗响应 Esc / 焦点锁。
 */
const dialogStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
  enabled = true
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // 退场动画期间不再响应 Esc / 焦点锁，并提前把焦点还给触发元素
    if (!enabled) return undefined;
    const token = Symbol('dialog');
    dialogStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const isTop = () => dialogStack[dialogStack.length - 1] === token;

    const focusFirst = () => {
      const root = containerRef.current;
      if (!root || !isTop()) return;
      if (root.contains(document.activeElement)) return;
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root;
      target.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      const root = containerRef.current;
      if (!root) return;

      if (e.key === 'Escape' && onCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (nodes.length === 0) {
          e.preventDefault();
          root.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      const idx = dialogStack.indexOf(token);
      if (idx >= 0) dialogStack.splice(idx, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [containerRef, enabled]);
}
