/**
 * 时间换算工具。
 *
 * 单独成文件是为了打断循环依赖：poi-scoring 需要 timeToMin，而 routing 需要
 * poi-scoring —— 若 timeToMin 留在 routing 里，两者会互相 import。
 */

export function timeToMin(t: string): number {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(m: number): string {
  const clamped = Math.max(0, Math.min(m, 1439)); // 00:00 - 23:59
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
