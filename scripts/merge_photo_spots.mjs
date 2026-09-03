#!/usr/bin/env node
/**
 * 把提取到的机位合并进 src/lib/photo-spots-ugc.ts。
 *
 * 提取结果直接入库不合适，需要三步清洗：
 *   1. 去重——同一个机位会被多个目标的笔记各提一次
 *   2. 剔除"其实是游乐项目/演出"的条目——模型把「在抱抱龙上看烟花」这类
 *      描述也当成了机位，但抱抱龙是项目本身，已在 RIDES 里
 *   3. 保留原文出处，UI 与 README 据此标注来源为游客笔记而非官方数据
 *
 * 时段字段一律不补：语料里没写就是没写，留空会让 poi-scoring 给出中性分，
 * 这比编一个时段再据此排程要诚实。
 *
 * 用法：node scripts/merge_photo_spots.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const AREA_NAMES = {
  mickey: "米奇大街", garden: "奇想花园", fantasy: "梦幻世界",
  adventure: "探险岛", treasure: "宝藏湾", tomorrow: "明日世界",
  toytown: "迪士尼·皮克斯玩具总动员", zootopia: "疯狂动物城",
};

/** 已在 RIDES / 演出里的名字，不该作为独立机位重复出现。 */
function looksLikeRideOrShow(name, rideNames) {
  const bare = name.split(/[（(·]/)[0].trim();
  if (rideNames.some((r) => bare === r || (bare.length > 3 && r.includes(bare)))) return true;
  return /秀$|表演$|巡游$/.test(bare);
}

/** 去重键：去掉括号补充与分隔符后的主名。 */
function dedupeKey(name) {
  return name.split(/[（(·—]/)[0].replace(/\s+/g, "").trim();
}

/** 合并两路提取结果：文本提取与图片视觉提取。 */
function loadSource(file, kind) {
  const p = path.join(ROOT, "data", "reference", file);
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  return (raw.spots ?? []).map((s) => ({
    ...s,
    extraction: kind,
    // 文本提取带 sourceQuote，视觉提取带 evidence，统一成 evidence 字段
    evidence: s.sourceQuote ?? s.evidence ?? "",
  }));
}

const extracted = {
  spots: [
    ...loadSource("photo-spots-extracted.json", "text"),
    ...loadSource("photo-spots-vision.json", "vision"),
  ],
};

const parksSrc = readFileSync(path.join(ROOT, "src", "lib", "parks-data.ts"), "utf-8");
const rideNames = [...parksSrc.matchAll(/name:"([^"]+)"/g)].map((m) => m[1]);

const seen = new Map();
const dropped = { duplicate: 0, isRideOrShow: 0 };

for (const s of extracted.spots) {
  if (looksLikeRideOrShow(s.name, rideNames)) {
    dropped.isRideOrShow++;
    continue;
  }
  const key = dedupeKey(s.name);
  const existing = seen.get(key);
  if (existing) {
    dropped.duplicate++;
    // 保留信息更全的那条
    if ((s.tips?.length ?? 0) > (existing.tips?.length ?? 0)) seen.set(key, s);
    continue;
  }
  seen.set(key, s);
}

let n = 0;
const spots = [...seen.values()].map((s) => ({
  id: `ugc-${++n}`,
  name: s.name,
  parkId: "shanghai",
  area: s.area,
  areaName: AREA_NAMES[s.area],
  nearestRide: s.fromTarget ?? "",
  walkFromNearestRide: 0,
  // 语料未提供时段则留空，由 poi-scoring 按中性处理，不编造
  bestTimeSlots: s.bestTimeSlots,
  bestConditions: s.bestConditions,
  tags: ["游客笔记"],
  tips: s.tips,
  xhsKeyword: s.name,
  duration: 10,
  photoType: s.photoType,
  source: { quote: s.evidence, url: s.sourceUrl, extraction: s.extraction },
}));

const header = `/**
 * 来自游客笔记的拍照机位
 *
 * 本文件由 scripts/merge_photo_spots.mjs 生成，请勿手工编辑。
 * 来源是 data/reviews/ 里抓取的真实小红书笔记，经 scripts/extract_photo_spots.mjs
 * 提取，每条都通过了「原文片段必须逐字出现在语料中」的校验，并保留出处。
 *
 * 与 PHOTO_SPOTS 中人工整理的机位不同，这些条目多数没有时段信息——语料本身就
 * 没写。bestTimeSlots 为空时 poi-scoring 按中性处理，不参与时段加减分。
 *
 * 注意：这是游客经验，不是官方数据，准确性未经核实。
 */

import { PhotoSpot } from "@/types";

export type UgcPhotoSpot = PhotoSpot & {
  source: {
    /** 支撑该条目的原文片段（文本提取）或图上可见依据（视觉提取） */
    quote: string;
    url: string;
    extraction: "text" | "vision";
  };
};

export const UGC_PHOTO_SPOTS: UgcPhotoSpot[] = ${JSON.stringify(spots, null, 2)};
`;

writeFileSync(path.join(ROOT, "src", "lib", "photo-spots-ugc.ts"), header, "utf-8");

console.log(`入库 ${spots.length} 条机位 → src/lib/photo-spots-ugc.ts`);
console.log(`剔除：重复 ${dropped.duplicate} 条，实为项目或演出 ${dropped.isRideOrShow} 条`);
console.log(
  `来源：文本提取 ${spots.filter((s) => s.source.extraction === "text").length} 条，` +
    `视觉提取 ${spots.filter((s) => s.source.extraction === "vision").length} 条`
);
console.log(`其中带时段标注的：${spots.filter((s) => s.bestTimeSlots.length).length} 条`);
