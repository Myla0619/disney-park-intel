/**
 * 已抓取评论语料的读取
 *
 * 语料由 scripts/collect_reviews.mjs 离线抓取后提交到 data/reviews/<targetId>.json。
 * 之所以不在请求路径里抓：Apify 按次计费，每次用户点开一个项目都去抓一遍既慢又烧钱，
 * 而评论本身几周才有实质变化。语料随仓库版本化，也让检索评测可复现。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { Review } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data", "reviews");

export type ReviewCorpusEntry = {
  targetId: string;
  targetType: "ride" | "restaurant";
  scrapedAt: string;
  keywords: string[];
  reviews: Review[];
};

const cache = new Map<string, ReviewCorpusEntry | null>();

export function loadCorpus(targetId: string): ReviewCorpusEntry | null {
  if (cache.has(targetId)) return cache.get(targetId)!;

  // targetId 来自 URL 查询参数，必须挡住路径穿越
  if (!/^[a-z0-9-]+$/i.test(targetId)) {
    cache.set(targetId, null);
    return null;
  }

  const file = path.join(DATA_DIR, `${targetId}.json`);
  let entry: ReviewCorpusEntry | null = null;

  if (existsSync(file)) {
    try {
      entry = JSON.parse(readFileSync(file, "utf-8")) as ReviewCorpusEntry;
    } catch (err) {
      console.error(`[review-store] ${targetId}.json 解析失败:`, err);
    }
  }

  cache.set(targetId, entry);
  return entry;
}

/** 语料覆盖了哪些目标，供 README 与评测脚本统计。 */
export function corpusTargets(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/** 仅供测试使用。 */
export function __clearCorpusCache() {
  cache.clear();
}
