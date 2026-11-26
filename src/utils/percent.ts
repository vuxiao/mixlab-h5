/**
 * 最大余数法（Hamilton）把一组数值换算为整数百分比，保证合计严格等于 100。
 * 例：6 × 40ml → [17, 17, 17, 17, 16, 16]，而不是 6 × 17 = 102%。
 */
export function toWholePercents(values: number[]): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);

  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const floored = raw.map((r) => Math.floor(r));
  let remaining = 100 - floored.reduce((s, v) => s + v, 0);

  const order = raw
    .map((r, idx) => ({ idx, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);

  for (let i = 0; remaining > 0 && i < order.length; i += 1, remaining -= 1) {
    floored[order[i].idx] += 1;
  }
  return floored;
}
