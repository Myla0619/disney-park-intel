#!/usr/bin/env node
/**
 * 由官方商店清单生成 src/lib/shops-data.ts。
 *
 * 数据源：上海迪士尼度假区官网「所有玩乐 → 商店」页面，含店名、所属主题园区、
 * 商品品类。原始抓取结果存于 data/reference/shanghai-shops.json，随仓库版本化。
 *
 * 所有派生字段（规模、停留时长、最佳时段、标签、提示）都由官方品类推导，不掺入
 * 主观经验——此前手写的商店数据里有几家店名在官方清单中根本不存在。
 *
 * 用法：node scripts/generate_shops.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LAND_TO_AREA = {
  "米奇大街": "mickey",
  "奇想花园": "garden",
  "梦幻世界": "fantasy",
  "探险岛": "adventure",
  "宝藏湾": "treasure",
  "明日世界": "tomorrow",
  "迪士尼·皮克斯玩具总动员": "toytown",
  "疯狂动物城": "zootopia",
};

/** 规模由官方列出的品类数推导：品类越多，店面越大、可逛内容越多。 */
function scaleOf(n) {
  if (n >= 18) return "flagship";
  if (n >= 10) return "major";
  if (n >= 5) return "small";
  return "kiosk";
}

const DURATION = { flagship: 30, major: 20, small: 12, kiosk: 6 };

/** 收藏品与乐园主题商品是限定款的载体，据此判断而非凭印象。 */
const LIMITED_SIGNALS = ["收藏品", "上海迪士尼乐园主题商品", "个性定制商品"];

function slugify(name, used) {
  const base =
    "shop-" +
    name
      .replace(/[——\-\s]+/g, "-")
      .replace(/[（）()]/g, "")
      .replace(/商店$/, "")
      .slice(0, 12);
  let id = base;
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

function tipsFor(name, categories, scale) {
  const notes = [];
  if (scale === "flagship") notes.push("全园品类最全的旗舰店，开园时段货品最齐");
  else if (scale === "kiosk") notes.push("路边小货车，品类少，顺路停留几分钟即可");

  if (categories.includes("商品快递")) notes.push("可办理商品快递，不必全程拎着");
  if (categories.includes("迪士尼乐拍通")) notes.push("提供迪士尼乐拍通服务");
  if (categories.includes("扭蛋机")) notes.push("店内有扭蛋机");
  if (categories.includes("礼服/角色扮演服")) notes.push("有礼服与角色扮演服，适合换装拍照");
  if (categories.includes("收藏品")) notes.push("有收藏品线，限定款通常在此上架");

  const cats = categories.filter((c) => !["商品快递", "迪士尼乐拍通", "扭蛋机"].includes(c));
  if (cats.length) notes.push(`主营：${cats.slice(0, 6).join("、")}`);

  return notes.join("。") + "。";
}

const raw = JSON.parse(
  readFileSync(path.join(ROOT, "data", "reference", "shanghai-shops.json"), "utf-8")
);

const used = new Set();
const shops = raw.map((s) => {
  const area = LAND_TO_AREA[s.land];
  if (!area) throw new Error(`未知主题园区: ${s.land}`);
  const scale = scaleOf(s.categories.length);
  return {
    id: slugify(s.name, used),
    name: s.name,
    parkId: "shanghai",
    area,
    areaName: s.land,
    theme: s.categories.slice(0, 3).join("、") || "未列出品类",
    categories: s.categories,
    scale,
    hasLimitedEdition: s.categories.some((c) => LIMITED_SIGNALS.includes(c)),
    // 旗舰店开园时货最全；其余随时可逛
    bestTimeToVisit: scale === "flagship" ? "opening" : "anytime",
    duration: DURATION[scale],
    tags: s.categories.slice(0, 8),
    tips: tipsFor(s.name, s.categories, scale),
  };
});

const header = `/**
 * 上海迪士尼乐园园内商店
 *
 * 本文件由 scripts/generate_shops.mjs 生成，请勿手工编辑。
 * 数据源：上海迪士尼度假区官网商店列表（店名、主题园区、商品品类均为官方数据），
 * 原始抓取结果见 data/reference/shanghai-shops.json。
 *
 * 规模、停留时长、最佳时段、限定款标记均由官方品类推导，不含主观经验成分。
 * 迪士尼小镇与酒店内的商店不在乐园门票范围内，未收录。
 */

import { ShopSpot } from "@/types";

export const SHANGHAI_SHOPS: ShopSpot[] = ${JSON.stringify(shops, null, 2)};
`;

writeFileSync(path.join(ROOT, "src", "lib", "shops-data.ts"), header, "utf-8");

const byArea = shops.reduce((acc, s) => ({ ...acc, [s.area]: (acc[s.area] ?? 0) + 1 }), {});
console.log(`已生成 ${shops.length} 家商店 → src/lib/shops-data.ts`);
console.log("各区分布:", byArea);
console.log("规模分布:", shops.reduce((a, s) => ({ ...a, [s.scale]: (a[s.scale] ?? 0) + 1 }), {}));
