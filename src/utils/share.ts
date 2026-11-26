export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'opened' | 'longpress';

export function isWeChat(): boolean {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent);
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? 'ontouchstart' in window;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * 保存/分享海报的分级兜底：
 * 1. 移动端优先 Web Share（files）—— iOS Safari / Android Chrome 可直接存相册或发给好友
 * 2. 微信内置浏览器不支持 a[download]，直接引导「长按图片保存」
 * 3. 支持 download 属性的浏览器用 Blob URL 下载
 * 4. 其他情况新开窗口展示图片，让用户长按/右键保存
 */
export async function savePosterImage(
  source: { blob?: Blob | null; dataUrl: string },
  filename: string,
  shareTitle: string
): Promise<ShareOutcome> {
  if (isWeChat()) return 'longpress';

  const blob = source.blob ?? (await dataUrlToBlob(source.dataUrl));

  if (isTouchDevice() && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle });
        return 'shared';
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // 其他错误（权限、未激活等）继续走下载兜底
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    if ('download' in link) {
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return 'downloaded';
    }
    const win = window.open(url, '_blank', 'noopener');
    return win ? 'opened' : 'longpress';
  } finally {
    // 给浏览器足够时间开始下载后再回收
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function describeShareOutcome(outcome: ShareOutcome): string | null {
  switch (outcome) {
    case 'shared':
      return null;
    case 'cancelled':
      return null;
    case 'downloaded':
      return '海报已下载';
    case 'opened':
      return '长按图片即可保存';
    case 'longpress':
    default:
      return '长按海报即可保存';
  }
}
