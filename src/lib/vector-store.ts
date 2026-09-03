/**
 * 评论检索
 *
 * 稀疏检索（BM25），不依赖神经网络嵌入：无额外依赖、冷启动为零，在几十条评论的
 * 规模上足够，代价是匹配不了完全不共词的同义表达。
 *
 * 中文分词：语料以中文为主，而中文没有词间空格。按空白切词会把整条评论变成一个
 * token，任何查询都匹配不上——这正是改写前的实际行为（真实评论上全部得分为 0）。
 * 这里对 CJK 采用字符二元组（bigram），是无词典中文检索的标准做法：
 * "适合孩子" → 适合 / 合孩 / 孩子，能与评论里的"孩子"对上。拉丁字母与数字仍按
 * 词切分。
 *
 * 检索质量由 scripts/eval_retrieval.py 在 scripts/retrieval_eval_set.json 标注集上
 * 以 P@5 / MRR / Recall@5 量化，可复现。
 */

import { Review } from "@/types";

const CJK = /[一-龥㐀-䶿]/;

/**
 * 混合分词：CJK 走字符二元组，拉丁/数字走词。
 * 单字 CJK 词（"贵"、"值"）也保留，否则单字查询检索不到。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase().replace(/[^一-龥㐀-䶿a-z0-9]+/g, " ");

  for (const chunk of normalized.split(/\s+/)) {
    if (!chunk) continue;

    if (!CJK.test(chunk)) {
      if (chunk.length > 1) tokens.push(chunk);
      continue;
    }

    // CJK 与拉丁混排的片段（"97cm就可以坐"）按类型切段后分别处理
    for (const segment of chunk.match(/[一-龥㐀-䶿]+|[a-z0-9]+/g) ?? []) {
      if (!CJK.test(segment)) {
        if (segment.length > 1) tokens.push(segment);
        continue;
      }
      if (segment.length === 1) {
        tokens.push(segment);
        continue;
      }
      for (let i = 0; i < segment.length - 1; i++) tokens.push(segment.slice(i, i + 2));
    }
  }

  return tokens;
}

// BM25 参数：k1 控制词频饱和，b 控制文档长度归一化，取信息检索领域的通用默认值。
const K1 = 1.5;
const B = 0.75;

type IndexedDoc<T> = { doc: T; tf: Map<string, number>; length: number };

export class VectorStore<T extends { text: string }> {
  private docs: IndexedDoc<T>[] = [];
  private df = new Map<string, number>();
  private avgLength = 0;

  index(docs: T[]) {
    this.docs = [];
    this.df = new Map();
    this.avgLength = 0;
    if (!docs.length) return;

    for (const doc of docs) {
      const tokens = tokenize(doc.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ doc, tf, length: tokens.length });
    }

    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / this.docs.length;
  }

  search(query: string, topK = 3): Array<T & { score: number }> {
    if (!this.docs.length) return [];

    const queryTokens = [...new Set(tokenize(query))];
    const N = this.docs.length;

    const scored = this.docs.map(({ doc, tf, length }) => {
      let score = 0;
      for (const token of queryTokens) {
        const freq = tf.get(token);
        if (!freq) continue;
        const df = this.df.get(token) ?? 0;
        // BM25 的概率型 IDF，加 1 保证非负（避免高频词把总分拉成负数）
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = freq * (K1 + 1);
        const denom = freq + K1 * (1 - B + (B * length) / (this.avgLength || 1));
        score += idf * (norm / denom);
      }
      return { ...doc, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ─── 按项目分片的评论存储 ────────────────────────────────────────────────────
const reviewStores = new Map<string, VectorStore<Review & { text: string }>>();

export function getReviewStore(rideId: string): VectorStore<Review & { text: string }> {
  let store = reviewStores.get(rideId);
  if (!store) {
    store = new VectorStore();
    reviewStores.set(rideId, store);
  }
  return store;
}

export function indexReviews(rideId: string, reviews: Review[]) {
  getReviewStore(rideId).index(reviews.map((r) => ({ ...r, text: r.text })));
}

export function searchReviews(rideId: string, query: string, topK = 5): Review[] {
  return getReviewStore(rideId).search(query, topK);
}

/** 仅供测试使用。 */
export function __clearReviewStores() {
  reviewStores.clear();
}
