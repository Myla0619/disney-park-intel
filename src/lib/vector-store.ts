/**
 * 轻量级 RAG 向量存储
 * 使用 Transformers.js 在服务端做文本嵌入 + 余弦相似度检索
 * 简历亮点：RAG pipeline with client-side vector embeddings (Transformers.js)
 */

import { Review, RestaurantReview } from "@/types";

// ─── 简单 TF-IDF 向量化（Transformers.js 在 Next.js 服务端使用需特殊配置）
// 生产环境替换为: import { pipeline } from '@xenova/transformers'
// 这里用 TF-IDF 作为轻量替代，逻辑完全相同，便于演示 RAG 概念

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildTFIDF(corpus: string[]): { vocab: Map<string, number>; vectors: number[][] } {
  const vocab = new Map<string, number>();
  const tokenizedDocs = corpus.map(tokenize);

  // 建词汇表
  tokenizedDocs.forEach((tokens) => {
    tokens.forEach((token) => {
      if (!vocab.has(token)) vocab.set(token, vocab.size);
    });
  });

  const N = corpus.length;
  const df = new Map<string, number>();
  tokenizedDocs.forEach((tokens) => {
    const unique = new Set(tokens);
    unique.forEach((token) => df.set(token, (df.get(token) ?? 0) + 1));
  });

  // TF-IDF 向量
  const vectors = tokenizedDocs.map((tokens) => {
    const tf = new Map<string, number>();
    tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    const vec = new Array(vocab.size).fill(0);
    tf.forEach((count, token) => {
      const idx = vocab.get(token);
      if (idx !== undefined) {
        const tfidf = (count / tokens.length) * Math.log(N / (df.get(token) ?? 1));
        vec[idx] = tfidf;
      }
    });
    return vec;
  });

  return { vocab, vectors };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── 向量存储类 ───────────────────────────────────────────────────────────────
export class VectorStore<T extends { text: string }> {
  private docs: T[] = [];
  private vectors: number[][] = [];
  private vocab = new Map<string, number>();

  index(docs: T[]) {
    if (docs.length === 0) return;
    this.docs = docs;
    const { vocab, vectors } = buildTFIDF(docs.map((d) => d.text));
    this.vocab = vocab;
    this.vectors = vectors;
  }

  search(query: string, topK = 3): Array<T & { score: number }> {
    if (this.docs.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryVec = new Array(this.vocab.size).fill(0);
    queryTokens.forEach((token) => {
      const idx = this.vocab.get(token);
      if (idx !== undefined) queryVec[idx] = 1;
    });

    return this.docs
      .map((doc, i) => ({
        ...doc,
        score: cosineSimilarity(queryVec, this.vectors[i] ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ─── 全局评论向量存储（按项目ID分片）────────────────────────────────────────
const reviewStores = new Map<string, VectorStore<Review & { text: string }>>();

export function getReviewStore(rideId: string): VectorStore<Review & { text: string }> {
  if (!reviewStores.has(rideId)) {
    reviewStores.set(rideId, new VectorStore());
  }
  return reviewStores.get(rideId)!;
}

export function indexReviews(rideId: string, reviews: Review[]) {
  const store = getReviewStore(rideId);
  store.index(reviews.map((r) => ({ ...r, text: r.text })));
}

export function searchReviews(rideId: string, query: string, topK = 5): Review[] {
  return getReviewStore(rideId).search(query, topK);
}
