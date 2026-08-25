#!/usr/bin/env node
/**
 * 抓取以「拍照机位」为主题的小红书笔记。
 *
 * 与 collect_reviews.mjs 的区别在于检索意图：那个脚本按游乐项目名抓，得到的是
 * 项目体验笔记；从中提取机位时，280 条里只挖出 7 条，且**没有一条带时段信息**
 * ——因为笔记本来就不在讲拍照。
 *
 * 这里改用拍照向关键词，笔记本身就在讨论机位、光线与时段，提取时段的命中率
 * 会高得多。产出交给 scripts/extract_photo_spots.mjs 处理。
 *
 * 用法：
 *   node scripts/collect_photo_notes.mjs --dry-run
 *   node scripts/collect_photo_notes.mjs --limit 15
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "reviews");
const ACTOR = process.env.APIFY_XHS_PHOTO_ACTOR ?? "habit.zhou~xiaohongshu-pro-scraper";

function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const idx = args.indexOf("--limit");
const PER_KEYWORD = idx === -1 ? 15 : Number(args[idx + 1]);
const dIdx = args.indexOf("--details");
/** 详情按条计费（约 $0.02/条），默认只补抓互动量最高的一批。 */
const DETAIL_LIMIT = dIdx === -1 ? 25 : Number(args[dIdx + 1]);

/** 关键词直指机位与时段，而不是项目体验。 */
const KEYWORDS = [
  "上海迪士尼拍照机位",
  "上海迪士尼出片点位",
  "上海迪士尼打卡点攻略",
  "上海迪士尼城堡拍照时间",
  "上海迪士尼拍照攻略光线",
  "上海迪士尼夜景拍照",
];

function toCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const m = String(raw ?? "").trim().match(/^([\d.]+)\s*(万|k|w)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] ?? "").toLowerCase();
  return u === "万" || u === "w" ? Math.round(n * 1e4) : u === "k" ? Math.round(n * 1e3) : Math.round(n);
}

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token && !DRY_RUN) {
    console.error("缺少 APIFY_TOKEN");
    process.exit(1);
  }

  console.log(`关键词 ${KEYWORDS.length} 个，每个最多 ${PER_KEYWORD} 条`);
  KEYWORDS.forEach((k) => console.log(`  ${k}`));
  if (DRY_RUN) return;

  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "search",
        keywords: KEYWORDS,
        maxItemsPerInput: PER_KEYWORD,
        sortType: "popularity_descending",
        noteType: "不限",
        timeFilter: "不限",
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`actor ${ACTOR} 返回 ${res.status}: ${body.slice(0, 300)}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("未返回数组");

  const limit = items.find((i) => i && (i.limit_reached || i.error));
  if (limit) throw new Error(limit.message ?? JSON.stringify(limit).slice(0, 200));

  console.log(`\n返回 ${items.length} 条原始笔记`);

  const scrapedAt = new Date().toISOString();
  const seen = new Set();
  const reviews = [];

  for (const n of items) {
    const id = String(n?.noteId ?? n?.noteUrl ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const text = `${String(n?.title ?? "").trim()} ${String(n?.bodyText ?? "").trim()}`.trim();
    if (text.length < 20) continue; // 拍照攻略正文太短的没有提取价值

    const likes = toCount(n.likes);
    reviews.push({
      source: "xiaohongshu",
      author: String(n?.author ?? "小红书用户"),
      rating: likes > 1000 ? 5 : likes > 200 ? 4 : 3,
      text: text.slice(0, 1200), // 攻略类笔记较长，留足正文供提取时段与机位
      date: n?.publishedAt || scrapedAt,
      tags: Array.isArray(n?.hashtags) ? n.hashtags.slice(0, 8) : [],
      sentiment: "neutral",
      url: String(n?.noteUrl ?? ""),
      scrapedAt,
      engagement: { likes, comments: toCount(n.commentsCount), collects: toCount(n.collects) },
      // 攻略类笔记的干货多写在图片上，正文常常只有话题标签。
      // 保留图片地址，供 extract_photo_spots.mjs 用视觉提取。
      imageUrls: Array.isArray(n?.imageUrls) ? n.imageUrls.slice(0, 4) : [],
    });
  }

  reviews.sort((a, b) => (b.engagement.likes ?? 0) - (a.engagement.likes ?? 0));

  // 说明：search 模式的 bodyText 截断在 85 字符左右，而详情模式要求 URL 带
  // xsec_token，本 actor 的搜索结果不提供该参数，因此无法补抓完整正文。
  // 攻略类笔记的实质内容本来也多在图片上，改走视觉提取。

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, "_photo-spots.json"),
    JSON.stringify(
      { targetId: "_photo-spots", targetType: "photo", scrapedAt, keywords: KEYWORDS, reviews },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  const withTime = reviews.filter((r) => /\d{1,2}[:：]\d{2}/.test(r.text)).length;
  const withImages = reviews.filter((r) => r.imageUrls.length).length;
  console.log(`去重后保留 ${reviews.length} 条 → data/reviews/_photo-spots.json`);
  console.log(`  正文含具体时刻: ${withTime} 条`);
  console.log(`  带图片: ${withImages} 条（攻略干货主要在图上，供视觉提取）`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
