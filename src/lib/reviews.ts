/**
 * 评论聚合服务
 *
 * 路由层（/api/reviews）与 Agent 的 search_reviews 工具共用同一份实现。
 *
 * 取数优先级：
 *   1. data/reviews/ 下已抓取并提交的真实小红书语料（review-store.ts）——
 *      默认路径，无需 token、无每次请求的抓取开销
 *   2. TripAdvisor（RapidAPI，需 RAPIDAPI_KEY）作为补充来源
 *   3. 两者都没有时，回退到 seed-reviews.ts 的人工示例，并置 fallback: true，
 *      UI 与 Agent 据此标注「示例数据」，不会把它当作真实用户评价陈述
 *
 * 抓取本身不在请求路径里：Apify 按次计费，且评论几周才有实质变化。
 * 由 scripts/collect_reviews.mjs 离线执行并提交结果。
 */

import { Review } from "@/types";
import { SEED_REVIEWS } from "./seed-reviews";
import { loadCorpus } from "./review-store";

export type ReviewTargetType = "ride" | "restaurant";

export type ReviewSummary = {
  positive: number;
  neutral: number;
  negative: number;
  avgRating: number;
  total: number;
};

export type ReviewsResult = {
  reviews: Review[];
  summary: ReviewSummary;
  /** true 表示返回的是人工示例数据，不是真实抓取的用户评论 */
  fallback: boolean;
  sources: string[];
  /** 真实语料的抓取时间，供 UI 显示「数据更新于」 */
  scrapedAt?: string;
};

/** TripAdvisor attraction id 映射；未列出的项目不走 TA 数据源。 */
const TA_IDS: Record<string, string> = { tron: "8763542", soaring: "7123841" };

export async function getReviews(id: string, type: ReviewTargetType): Promise<ReviewsResult> {
  const corpus = loadCorpus(id);
  const ta = await fetchTripAdvisorReviews(id);

  const real = [...(corpus?.reviews ?? []), ...ta.reviews];

  if (real.length) {
    const reviews = sortByDateDesc(real);
    return {
      reviews,
      summary: computeSummary(reviews),
      fallback: false,
      sources: [...(corpus ? ["xiaohongshu"] : []), ...ta.sources],
      scrapedAt: corpus?.scrapedAt,
    };
  }

  // 没有任何真实语料时才用示例数据，并明确标注
  const seeded = sortByDateDesc(SEED_REVIEWS[id] ?? []);
  return {
    reviews: seeded,
    summary: computeSummary(seeded),
    fallback: true,
    sources: ["seed"],
  };
}

function sortByDateDesc(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

type SourceResult = { reviews: Review[]; fallback: boolean; sources: string[] };

// ─── TripAdvisor（RapidAPI）───────────────────────────────────────────────
async function fetchTripAdvisorReviews(id: string): Promise<SourceResult> {
  if (!process.env.RAPIDAPI_KEY || !TA_IDS[id]) return { reviews: [], fallback: true, sources: [] };

  try {
    const res = await fetch(
      `https://tripadvisor16.p.rapidapi.com/api/v1/attraction/getAttractionReviews?attractionId=${TA_IDS[id]}&language=en`,
      {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "tripadvisor16.p.rapidapi.com",
        },
      }
    );
    if (!res.ok) throw new Error(`RapidAPI responded ${res.status}`);
    const data = await res.json();
    const reviews = (data.data?.reviewList ?? []).slice(0, 5).map(normalizeTA);
    return { reviews, fallback: false, sources: ["tripadvisor"] };
  } catch (err) {
    console.error("[reviews] TripAdvisor 抓取失败:", err);
    return { reviews: [], fallback: true, sources: [] };
  }
}

function normalizeTA(item: any): Review {
  const text = (item.text ?? "").slice(0, 300);
  return {
    source: "tripadvisor",
    author: item.userProfile?.displayName ?? "TripAdvisor User",
    rating: item.rating ?? 4,
    text,
    date: item.publishedDate ?? new Date().toISOString(),
    tags: extractTags(text),
    sentiment: item.rating >= 4 ? "positive" : item.rating === 3 ? "neutral" : "negative",
  };
}

/**
 * 词典法情感判定。
 * 只是关键词计数，不是模型推断——短评论、反讽、否定句都会判错，
 * 仅用于给聚合面板一个粗粒度分布。
 */
export function analyzeSentiment(text: string): Review["sentiment"] {
  const pos = ["好玩","推荐","必玩","值得","棒","超好","amazing","great","loved","fantastic","好吃","美味","惊艳"];
  const neg = ["排队","太久","不值","失望","bad","waste","terrible","boring","一般","难吃","贵","坑"];
  const p = pos.filter((w) => text.includes(w)).length;
  const n = neg.filter((w) => text.includes(w)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}

export function extractTags(text: string): string[] {
  const tagMap: Record<string, string[]> = {
    "kids-friendly": ["小孩","宝宝","孩子","儿童","kid","child"],
    "long-wait":     ["排队","等候","久","long wait","waited"],
    "must-do":       ["必玩","必去","must","don't miss","best"],
    "thrill":        ["刺激","惊险","速度","thrill","fast"],
    "skip":          ["不值","失望","skip","overrated","waste"],
    "good-food":     ["好吃","美味","推荐","delicious"],
    "photo-worthy":  ["出片","拍照","好看","美","scenic"],
    "reservation":   ["预约","订位","提前","reservation","book"],
  };
  const lower = text.toLowerCase();
  return Object.entries(tagMap)
    .filter(([, kws]) => kws.some((kw) => lower.includes(kw.toLowerCase())))
    .map(([tag]) => tag);
}

export function computeSummary(reviews: Review[]): ReviewSummary {
  if (!reviews.length) return { positive: 0, neutral: 0, negative: 0, avgRating: 0, total: 0 };
  const counts = { positive: 0, neutral: 0, negative: 0 };
  let total = 0;
  for (const r of reviews) {
    counts[r.sentiment]++;
    total += r.rating;
  }
  return { ...counts, avgRating: +(total / reviews.length).toFixed(1), total: reviews.length };
}
