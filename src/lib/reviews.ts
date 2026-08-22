/**
 * 评论聚合服务
 *
 * 路由层（/api/reviews）与 Agent 的 search_reviews 工具共用同一份实现。
 *
 * 数据源与降级：
 *   - 小红书：Apify actor，需 APIFY_TOKEN
 *   - TripAdvisor：RapidAPI，需 RAPIDAPI_KEY 且该项目在 TA_IDS 中有映射
 *   - 两者都未配置或调用失败时，回退到 seed-reviews.ts 里的人工示例数据，
 *     并在结果中置 fallback: true，调用方据此标注「示例数据」
 */

import { Review } from "@/types";
import { RIDE_KEYWORDS, RESTAURANT_KEYWORDS } from "./parks-data";
import { SEED_REVIEWS } from "./seed-reviews";

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
  /** true 表示至少部分内容来自示例数据而非真实抓取 */
  fallback: boolean;
  sources: string[];
};

/** TripAdvisor attraction id 映射；未列出的项目不走 TA 数据源。 */
const TA_IDS: Record<string, string> = { tron: "8763542", soaring: "7123841" };

export async function getReviews(id: string, type: ReviewTargetType): Promise<ReviewsResult> {
  const [xhs, ta] = await Promise.all([fetchXHSReviews(id, type), fetchTripAdvisorReviews(id)]);

  const live = [...xhs.reviews, ...ta.reviews];
  const sources = [...xhs.sources, ...ta.sources];

  // 任一数据源缺席就补上该来源的示例数据，保证 UI 与 RAG 检索始终有内容
  const seeded = live.length ? live : (SEED_REVIEWS[id] ?? []);
  const fallback = !live.length || xhs.fallback || ta.fallback;

  const reviews = seeded.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    reviews,
    summary: computeSummary(reviews),
    fallback,
    sources: sources.length ? sources : ["seed"],
  };
}

type SourceResult = { reviews: Review[]; fallback: boolean; sources: string[] };

// ─── 小红书（Apify，多关键词并发）──────────────────────────────────────────
async function fetchXHSReviews(id: string, type: ReviewTargetType): Promise<SourceResult> {
  if (!process.env.APIFY_TOKEN) return { reviews: [], fallback: true, sources: [] };

  const keywords = type === "ride" ? (RIDE_KEYWORDS[id] ?? [id]) : (RESTAURANT_KEYWORDS[id] ?? [id]);

  try {
    const batches = await Promise.all(
      keywords.map(async (kw) => {
        const res = await fetch(
          `https://api.apify.com/v2/acts/joshina~xiaohongshu-scraper/run-sync?token=${process.env.APIFY_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ searchQuery: `迪士尼 ${kw}`, maxResults: 5 }),
          }
        );
        if (!res.ok) throw new Error(`Apify responded ${res.status}`);
        const data = await res.json();
        return (data.items ?? []).map(normalizeXHS);
      })
    );

    const seen = new Set<string>();
    const reviews = batches.flat().filter((r: Review) => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
    return { reviews, fallback: false, sources: ["xiaohongshu"] };
  } catch (err) {
    console.error("[reviews] Apify 小红书抓取失败:", err);
    return { reviews: [], fallback: true, sources: [] };
  }
}

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

function normalizeXHS(item: any): Review {
  const text = `${item.title ?? ""} ${item.desc ?? ""}`.slice(0, 300);
  return {
    source: "xiaohongshu",
    author: item.author?.nickname ?? "小红书用户",
    rating: item.likeCount > 1000 ? 5 : item.likeCount > 200 ? 4 : 3,
    text,
    date: item.time ?? new Date().toISOString(),
    tags: extractTags(text),
    sentiment: analyzeSentiment(text),
    url: `https://www.xiaohongshu.com/explore/${item.id}`,
  };
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
