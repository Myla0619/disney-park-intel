#!/usr/bin/env node
/**
 * 抓取小红书笔记，生成 data/reviews/<targetId>.json 语料。
 *
 * 两段式：搜索 actor 拿笔记列表（含带 xsec_token 的链接）→ 详情 actor 拿正文。
 * 搜索结果只有标题，而评论语料需要的是正文。
 *
 * 抓取按次计费，因此这是离线脚本，不在请求路径里跑；结果提交进仓库后，
 * 线上无需 APIFY_TOKEN 即可提供真实评论（见 src/lib/review-store.ts）。
 *
 * 用法：
 *   export APIFY_TOKEN=apify_api_xxx
 *   node scripts/collect_reviews.mjs                    # 抓全部目标
 *   node scripts/collect_reviews.mjs --target tron      # 只抓一个
 *   node scripts/collect_reviews.mjs --limit 3          # 每个关键词最多几条
 *   node scripts/collect_reviews.mjs --dry-run          # 只打印计划，不调用 API
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data", "reviews");
const APIFY_BASE = "https://api.apify.com/v2/acts";

const SEARCH_ACTOR = process.env.APIFY_XHS_SEARCH_ACTOR ?? "easyapi~rednote-xiaohongshu-search-scraper";
const DETAIL_ACTOR = process.env.APIFY_XHS_DETAIL_ACTOR ?? "zen-studio~rednote-note-detail-scraper";

/**
 * 读取 .env.local（该文件已在 .gitignore 中）。
 * 不引 dotenv：这个脚本要能用裸 node 跑，少一个依赖少一分心智负担。
 */
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    // 已有的环境变量优先，方便临时覆盖
    if (value && !process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const DRY_RUN = args.includes("--dry-run");
const ONLY_TARGET = flag("--target", null);
const PER_KEYWORD = Number(flag("--limit", 5));

/**
 * 从 parks-data.ts 解析关键词表。直接读源文件而不是引入构建步骤：
 * 脚本要能用裸 node 跑，同时关键词必须与应用共用一份，不能在这里复制。
 */
function loadKeywordTables() {
  const src = readFileSync(path.join(ROOT, "src", "lib", "parks-data.ts"), "utf-8");

  function parseTable(exportName, type) {
    const start = src.indexOf(`export const ${exportName}`);
    if (start === -1) throw new Error(`未找到 ${exportName}`);
    const open = src.indexOf("{", start);
    let depth = 0, end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(open + 1, end);
    const out = [];
    const re = /"([^"]+)":\s*\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const keywords = [...m[2].matchAll(/"([^"]+)"/g)].map((k) => k[1]);
      if (keywords.length) out.push({ targetId: m[1], targetType: type, keywords });
    }
    return out;
  }

  return [...parseTable("RIDE_KEYWORDS", "ride"), ...parseTable("RESTAURANT_KEYWORDS", "restaurant")];
}

async function runActor(actor, input, token) {
  const res = await fetch(
    `${APIFY_BASE}/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`actor ${actor} 返回 ${res.status}: ${body.slice(0, 300)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`actor ${actor} 未返回数组`);
  return items;
}

function toCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const m = String(raw ?? "").trim().match(/^([\d.]+)\s*(万|k|w)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] ?? "").toLowerCase();
  return u === "万" || u === "w" ? Math.round(n * 1e4) : u === "k" ? Math.round(n * 1e3) : Math.round(n);
}

function toIso(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw < 1e12 ? raw * 1000 : raw);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const d = new Date(String(raw ?? "").trim());
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// ─── 与 src/lib/reviews.ts 一致的情感与标签规则 ──────────────────────────────
const POS = ["好玩","推荐","必玩","值得","棒","超好","amazing","great","loved","fantastic","好吃","美味","惊艳"];
const NEG = ["排队","太久","不值","失望","bad","waste","terrible","boring","一般","难吃","贵","坑"];
const TAG_MAP = {
  "kids-friendly": ["小孩","宝宝","孩子","儿童","kid","child"],
  "long-wait": ["排队","等候","久","long wait","waited"],
  "must-do": ["必玩","必去","must","don't miss","best"],
  thrill: ["刺激","惊险","速度","thrill","fast"],
  skip: ["不值","失望","skip","overrated","waste"],
  "good-food": ["好吃","美味","推荐","delicious"],
  "photo-worthy": ["出片","拍照","好看","美","scenic"],
  reservation: ["预约","订位","提前","reservation","book"],
};

const sentiment = (t) => {
  const p = POS.filter((w) => t.includes(w)).length;
  const n = NEG.filter((w) => t.includes(w)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
};
const tagsOf = (t) =>
  Object.entries(TAG_MAP)
    .filter(([, kws]) => kws.some((k) => t.toLowerCase().includes(k.toLowerCase())))
    .map(([tag]) => tag);

/** 小红书没有星级，用点赞量分档近似——在语料里如实记为近似值。 */
const ratingFromLikes = (likes) => (likes > 1000 ? 5 : likes > 200 ? 4 : 3);

async function collectTarget({ targetId, targetType, keywords }, token) {
  const queries = keywords.map((k) => `上海迪士尼 ${k}`);
  console.log(`\n[${targetId}] 关键词: ${queries.join(" / ")}`);

  if (DRY_RUN) {
    console.log(`  (dry-run) 将搜索 ${queries.length} 个关键词 × 每个最多 ${PER_KEYWORD} 条`);
    return null;
  }

  const found = await runActor(
    SEARCH_ACTOR,
    { keywords: queries, maxItems: PER_KEYWORD, sortType: "popularity_descending", noteType: "all" },
    token
  );

  const links = [];
  const seen = new Set();
  for (const row of found) {
    const link = row?.link;
    if (!link || seen.has(link)) continue;
    seen.add(link);
    links.push(link);
  }
  console.log(`  搜索到 ${links.length} 条不重复笔记`);
  if (!links.length) return null;

  const details = await runActor(DETAIL_ACTOR, { noteUrls: links }, token);
  console.log(`  取回 ${details.length} 条正文`);

  const scrapedAt = new Date().toISOString();
  const reviews = [];
  for (const n of details) {
    const text = `${String(n?.title ?? "").trim()} ${String(n?.description ?? "").trim()}`.trim();
    if (text.length < 10) continue; // 正文过短的笔记对检索没有价值

    const likes = toCount(n.liked_count);
    reviews.push({
      source: "xiaohongshu",
      author: String(n.nickname ?? "小红书用户"),
      rating: ratingFromLikes(likes),
      text: text.slice(0, 500),
      date: toIso(n.time ?? n.timestamp ?? n.last_update_time) || scrapedAt,
      tags: tagsOf(text),
      sentiment: sentiment(text),
      url: String(n.url ?? ""),
      scrapedAt,
      engagement: {
        likes,
        comments: toCount(n.comments_count),
        collects: toCount(n.collected_count),
      },
    });
  }

  // 按互动量降序，让最有代表性的笔记排在前面
  reviews.sort((a, b) => (b.engagement.likes ?? 0) - (a.engagement.likes ?? 0));
  console.log(`  保留 ${reviews.length} 条有效评论`);

  return { targetId, targetType, scrapedAt, keywords, reviews };
}

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token && !DRY_RUN) {
    console.error(
      "缺少 APIFY_TOKEN。\n" +
      "  1. 在 https://apify.com 注册（有免费额度）\n" +
      "  2. Settings → API & Integrations 复制 token\n" +
      "  3. export APIFY_TOKEN=apify_api_xxx\n" +
      "先用 --dry-run 可以查看将要抓取的关键词而不调用 API。"
    );
    process.exit(1);
  }

  let targets = loadKeywordTables();
  if (ONLY_TARGET) targets = targets.filter((t) => t.targetId === ONLY_TARGET);
  if (!targets.length) {
    console.error(ONLY_TARGET ? `未找到目标: ${ONLY_TARGET}` : "关键词表为空");
    process.exit(1);
  }

  console.log(`准备抓取 ${targets.length} 个目标，每个关键词最多 ${PER_KEYWORD} 条`);
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0, failed = 0, totalReviews = 0;
  for (const target of targets) {
    try {
      const entry = await collectTarget(target, token);
      if (!entry || !entry.reviews.length) continue;
      writeFileSync(
        path.join(OUT_DIR, `${entry.targetId}.json`),
        JSON.stringify(entry, null, 2) + "\n",
        "utf-8"
      );
      ok++;
      totalReviews += entry.reviews.length;
    } catch (err) {
      // 单个目标失败不应中断整批
      console.error(`  [${target.targetId}] 失败: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n完成：${ok} 个目标写入语料，共 ${totalReviews} 条评论，${failed} 个失败`);
  if (!DRY_RUN && ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
