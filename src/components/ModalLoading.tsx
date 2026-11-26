import React from 'react';
import { Loader2 } from 'lucide-react';

/** 懒加载弹窗的过渡占位 */
export const ModalLoading: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md anim-fade-in"
  >
    <div className="flex flex-col items-center gap-2 text-[#C89B54]">
      <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
      <span className="text-xs">{label}</span>
    </div>
  </div>
);
