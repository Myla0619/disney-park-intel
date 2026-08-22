#!/usr/bin/env node
/**
 * 步行时间矩阵的几何一致性检查
 *
 * WALK_MATRIX 是手工估算的，从未与真实距离对照过。这个脚本用 themeparks.wiki
 * 的实体坐标算出各主题区质心，据此得到步行时间的几何下界，标出明显对不上的条目。
 *
 * 两条基准要分清：
 *   硬下界 = 直线距离 ÷ 步速。低于它意味着走得比直线还快，物理上不可能，是确定的错误。
 *   期望值 = 硬下界 × 绕行系数。低于它只说明估得偏乐观，不构成硬矛盾。
 *
 * 反方向的偏高同样不等于写错：园区中央是大湖，两区直线很近却要绕行的情况真实存在。
 * 脚本只把可疑项列出来供实地核对，不自动改数——只有硬下界的违反才判定为失败。
 *
 * 用法：node scripts/check_walk_matrix.mjs [--max-ratio 3]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const idx = args.indexOf("--max-ratio");
const MAX_RATIO = idx === -1 ? 3 : Number(args[idx + 1]);

/** 成人步速 80 m/min；实际步道相对直线的绕行系数取 1.35 */
const WALK_SPEED_M_PER_MIN = 80;
const PATH_FACTOR = 1.35;

function parseAreaCoords() {
  const src = readFileSync(path.join(ROOT, "src", "lib", "park-geo.ts"), "utf-8");
  const body = src.slice(src.indexOf("AREA_COORDS"), src.indexOf("PARK_BOUNDS"));
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*\{ lat: ([\d.]+), lng: ([\d.]+) \}/g)) {
    out[m[1]] = { lat: Number(m[2]), lng: Number(m[3]) };
  }
  return out;
}

function parseWalkMatrix() {
  const src = readFileSync(path.join(ROOT, "src", "lib", "parks-data.ts"), "utf-8");
  const body = src.slice(src.indexOf("WALK_MATRIX"), src.indexOf("export function walkTime"));
  const out = {};
  for (const line of body.split("\n")) {
    const row = line.match(/^\s*(\w+):\s*\{(.*)\},/);
    if (!row) continue;
    out[row[1]] = {};
    for (const cell of row[2].matchAll(/(\w+):(\d+)/g)) out[row[1]][cell[1]] = Number(cell[2]);
  }
  return out;
}

function distanceMeters(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const p1 = rad(a.lat), p2 = rad(b.lat);
  const h =
    Math.sin((p2 - p1) / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const coords = parseAreaCoords();
const matrix = parseWalkMatrix();

const rows = [];
for (const a of Object.keys(coords)) {
  for (const b of Object.keys(coords)) {
    if (a >= b) continue;
    const estimate = matrix[a]?.[b];
    if (estimate == null) continue;
    const meters = distanceMeters(coords[a], coords[b]);
    const hardMin = meters / WALK_SPEED_M_PER_MIN;
    const expected = hardMin * PATH_FACTOR;
    rows.push({
      pair: `${a}→${b}`, meters, hardMin, expected, estimate,
      ratio: estimate / expected,
      impossible: estimate < hardMin,
    });
  }
}
rows.sort((x, y) => y.ratio - x.ratio);

console.log(`比对 ${rows.length} 个区段（矩阵覆盖 ${Object.keys(matrix).length} 个区域，坐标覆盖 ${Object.keys(coords).length} 个）\n`);
console.log(`${"区段".padEnd(22)}${"直线m".padStart(7)}${"硬下界".padStart(8)}${"期望".padStart(7)}${"矩阵".padStart(6)}${"比值".padStart(7)}`);
for (const r of rows) {
  const flag = r.impossible
    ? "  ← 快过直线，不可能"
    : r.ratio > MAX_RATIO
    ? "  ← 偏高，需实地核对"
    : r.ratio < 1
    ? "  ← 偏乐观"
    : "";
  console.log(
    `${r.pair.padEnd(22)}${r.meters.toFixed(0).padStart(7)}${r.hardMin.toFixed(1).padStart(8)}${r.expected.toFixed(1).padStart(7)}${String(r.estimate).padStart(6)}${r.ratio.toFixed(2).padStart(7)}${flag}`
  );
}

const impossible = rows.filter((r) => r.impossible);
const suspicious = rows.filter((r) => r.ratio > MAX_RATIO);
const mean = rows.reduce((s, r) => s + r.ratio, 0) / rows.length;

console.log(`\n平均比值 ${mean.toFixed(2)}`);
console.log(`快过直线（硬矛盾）：${impossible.length} 个`);
console.log(`低于期望值（偏乐观，非硬错）：${rows.filter((r) => !r.impossible && r.ratio < 1).length} 个`);
console.log(`比值超过 ${MAX_RATIO}（需人工核对）：${suspicious.length} 个`);

// 只有硬矛盾才算失败：偏高可能是绕湖等真实原因，偏乐观也在估算误差内
if (impossible.length) {
  console.error("\n存在步行时间快于直线距离的条目，这在物理上不可能，请修正 WALK_MATRIX。");
  process.exit(1);
}
