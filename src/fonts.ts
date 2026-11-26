/**
 * 自托管拉丁字体子集（Playfair Display / JetBrains Mono），
 * 页面与海报 canvas 共用同一套字体栈，避免「页面一个样、海报一个样」。
 * 中文字形仍回退到系统字体（苹方 / 思源 / 微软雅黑），避免数 MB 的中文字体包。
 */
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';

export const FONT_SERIF = '"Playfair Display", Georgia, "Songti SC", "Noto Serif SC", "STSong", serif';
export const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
export const FONT_MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

/** 海报绘制前确保自托管字体已就绪（最多等 1.5s，超时则用回退字体继续） */
export async function ensurePosterFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const loads = Promise.all([
    document.fonts.load(`700 28px "Playfair Display"`),
    document.fonts.load(`italic 700 20px "Playfair Display"`),
    document.fonts.load(`500 14px "JetBrains Mono"`),
    document.fonts.load(`700 18px "JetBrains Mono"`),
  ]).catch(() => undefined);
  await Promise.race([loads, new Promise((r) => setTimeout(r, 1500))]);
}
