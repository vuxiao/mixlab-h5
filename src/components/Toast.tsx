import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Presence } from './Presence';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

/** 全局轻提示：位于所有弹窗之上，屏幕阅读器可读 */
export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return undefined;
    const ms = toast.tone === 'error' ? 4200 : 2800;
    const timer = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-[80] flex justify-center px-4"
    >
      <Presence value={toast} exitMs={240}>
        {(t, closing) => (
        <div
          key={t.id}
          data-testid="toast"
          data-tone={t.tone}
          className={`pointer-events-auto max-w-[380px] flex items-start gap-2 px-3.5 py-2.5 rounded-2xl border backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.6)] text-[12px] leading-snug ${
            closing ? 'anim-toast-out' : 'anim-toast-in'
          } ${
            t.tone === 'error'
              ? 'bg-[#3A1218] border-[#E88A96]/60 text-[#FFE3E7]'
              : t.tone === 'success'
              ? 'bg-[#16261B] border-[#5BB974]/55 text-[#D4F5DC]'
              : 'bg-[#211510] border-[#E5A93C]/55 text-[#F5EBD6]'
          }`}
          onClick={onDismiss}
        >
          {t.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          ) : t.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          ) : (
            <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          )}
          <span>{t.text}</span>
        </div>
        )}
      </Presence>
    </div>
  );
};
