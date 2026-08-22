/**
 * 小红书笔记抓取（经 Apify）
 *
 * 小红书没有公开 API，且对直连抓取有签名校验。这里走 Apify 上维护中的第三方
 * actor，两段式：
 *   1. 搜索 actor 按关键词拿笔记列表（标题、点赞数、带 xsec_token 的链接）
 *   2. 详情 actor 按链接拿正文 description —— 搜索结果只有标题，没有正文，
 *      而评论语料需要的正是正文
 *
 * 两个此前存在的问题：
 *   - 旧代码引用的 actor `joshina/xiaohongshu-scraper` 已下架（404），
 *     即使配了 token 也拿不到任何数据
 *   - 调用的是 `run-sync`，该端点返回 run 元数据而非抓取结果，
 *     因此 `data.items` 恒为空。正确端点是 `run-sync-get-dataset-items`
 *
 * 抓取按次计费，因此线上不在请求路径里调用：由 scripts/collect_reviews.mjs
 * 离线跑一次并把结果提交进仓库，运行时读已提交的语料（见 review-store.ts）。
 */

const APIFY_BASE = "https://api.apify.com/v2/acts";

const SEARCH_ACTOR = process.env.APIFY_XHS_SEARCH_ACTOR ?? "easyapi~rednote-xiaohongshu-search-scraper";
const DETAIL_ACTOR = process.env.APIFY_XHS_DETAIL_ACTOR ?? "zen-studio~rednote-note-detail-scraper";

export type XhsNote = {
  id: string;
  title: string;
  /** 正文；搜索阶段拿不到，需详情阶段补齐 */
  description: string;
  author: string;
  url: string;
  likes: number;
  comments: number;
  collects: number;
  /** 笔记发布时间，ISO 8601；数据源缺失时为空 */
  publishedAt: string;
};

export class ApifyError extends Error {}

/**
 * 调用 actor 并直接取回 dataset items。
 * run-sync-get-dataset-items 是同步端点：请求返回时抓取已完成，结果即响应体。
 */
async function runActor(actor: string, input: unknown, token: string): Promise<any[]> {
  const res = await fetch(
    `${APIFY_BASE}/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApifyError(`Apify actor ${actor} 返回 ${res.status}: ${body.slice(0, 300)}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) {
    throw new ApifyError(`Apify actor ${actor} 未返回数组，实际为 ${typeof items}`);
  }
  return items;
}

/** 第一段：按关键词搜索，返回带 xsec_token 的笔记链接。 */
export async function searchNotes(
  keywords: string[],
  maxItemsPerKeyword: number,
  token: string
): Promise<{ id: string; title: string; author: string; url: string; likes: number }[]> {
  const items = await runActor(
    SEARCH_ACTOR,
    { keywords, maxItems: maxItemsPerKeyword, sortType: "popularity_descending", noteType: "all" },
    token
  );

  const out: { id: string; title: string; author: string; url: string; likes: number }[] = [];
  for (const row of items) {
    const card = row?.item?.note_card;
    const link = row?.link;
    if (!card || !link) continue;
    out.push({
      id: String(row.item.id ?? ""),
      title: String(card.display_title ?? ""),
      author: String(card.user?.nickname ?? "小红书用户"),
      url: String(link),
      likes: Number(card.interact_info?.liked_count ?? 0),
    });
  }
  return out;
}

/** 第二段：按链接取正文与互动数据。 */
export async function fetchNoteDetails(urls: string[], token: string): Promise<XhsNote[]> {
  if (!urls.length) return [];
  const items = await runActor(DETAIL_ACTOR, { noteUrls: urls }, token);

  const out: XhsNote[] = [];
  for (const n of items) {
    const description = String(n?.description ?? "").trim();
    const title = String(n?.title ?? "").trim();
    if (!description && !title) continue;

    out.push({
      id: String(n.id ?? ""),
      title,
      description,
      author: String(n.nickname ?? "小红书用户"),
      url: String(n.url ?? ""),
      likes: toCount(n.liked_count),
      comments: toCount(n.comments_count),
      collects: toCount(n.collected_count),
      publishedAt: toIso(n.time ?? n.timestamp ?? n.last_update_time),
    });
  }
  return out;
}

/** 小红书的计数可能是 "1.2万" 这类字符串，直接 Number() 会得到 NaN。 */
export function toCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const m = s.match(/^([\d.]+)\s*(万|k|w)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "万" || unit === "w") return Math.round(n * 10_000);
  if (unit === "k") return Math.round(n * 1_000);
  return Math.round(n);
}

/** 数据源的时间字段可能是秒级、毫秒级时间戳或已格式化的字符串。 */
export function toIso(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // 小于 1e12 视为秒级时间戳
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
