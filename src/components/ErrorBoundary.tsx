import React from 'react';
import { clearAllLocalData } from '../storage/cabinetStorage';

interface ErrorBoundaryState {
  error: Error | null;
}

/** 渲染异常兜底：避免整站白屏，并提供「清空本地数据」自救入口 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[MixLab] 渲染异常已被兜底捕获', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    clearAllLocalData();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alertdialog"
        aria-labelledby="mixlab-error-title"
        className="w-full max-w-[430px] app-vh flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#120B08]"
      >
        <div className="text-4xl" aria-hidden="true">🍸</div>
        <h1 id="mixlab-error-title" className="font-editorial text-xl font-bold text-[#F5EBD6]">
          吧台出了点小意外
        </h1>

        <div className="w-full flex flex-col gap-2">
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#8F1D2C] to-[#A82738] text-[#F5EBD6] text-sm font-semibold border border-[#E5A93C]/55"
          >
            重新加载
          </button>
          <button
            type="button"
            data-testid="error-reset-btn"
            onClick={this.handleReset}
            className="w-full py-2.5 rounded-xl bg-[#1D130F] text-[#E6D9C3] text-xs border border-[#C89B54]/35"
          >
            清空数据并重试
          </button>
        </div>
      </div>
    );
  }
}
