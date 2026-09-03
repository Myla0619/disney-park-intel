/**
 * 检索质量评测
 *
 * 在 scripts/retrieval_eval_set.json 的人工标注集上跑真实检索代码，算 P@1 / P@3 /
 * Recall@3 / MRR / nDCG@5。指标写入 scripts/retrieval_eval_results.json，任何人
 * clone 下来跑 `npm run eval:retrieval` 都能复现同一组数字。
 *
 * 阈值是回归护栏，不是达标线：改动分词或打分方式后若跌破，说明检索变差了。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { VectorStore } from "../vector-store";
import { SEED_REVIEWS } from "../seed-reviews";

type EvalSet = {
  queries: { id: string; query: string; relevant: string[]; rationale: string }[];
};

const evalSet: EvalSet = JSON.parse(readFileSync("scripts/retrieval_eval_set.json", "utf-8"));

/** 把分片的示例评论摊平成带 id 的单一语料，id 形如 <targetId>#<index>。 */
function buildCorpus() {
  const docs: { id: string; text: string }[] = [];
  for (const [target, reviews] of Object.entries(SEED_REVIEWS)) {
    reviews.forEach((r, i) => docs.push({ id: `${target}#${i}`, text: r.text }));
  }
  return docs;
}

function precisionAtK(ranked: string[], relevant: Set<string>, k: number) {
  const top = ranked.slice(0, k);
  return top.filter((id) => relevant.has(id)).length / Math.max(1, top.length);
}

function recallAtK(ranked: string[], relevant: Set<string>, k: number) {
  if (!relevant.size) return 0;
  return ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size;
}

function reciprocalRank(ranked: string[], relevant: Set<string>) {
  const idx = ranked.findIndex((id) => relevant.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

function ndcgAtK(ranked: string[], relevant: Set<string>, k: number) {
  const dcg = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(k, relevant.size) }).reduce<number>(
    (sum, _, i) => sum + 1 / Math.log2(i + 2),
    0
  );
  return ideal === 0 ? 0 : dcg / ideal;
}

describe("检索质量", () => {
  const corpus = buildCorpus();
  const store = new VectorStore<{ id: string; text: string }>();
  store.index(corpus);

  const perQuery = evalSet.queries.map((q) => {
    const relevant = new Set(q.relevant);
    const ranked = store.search(q.query, 5).map((r) => r.id);
    return {
      id: q.id,
      query: q.query,
      ranked,
      p1: precisionAtK(ranked, relevant, 1),
      p3: precisionAtK(ranked, relevant, 3),
      recall3: recallAtK(ranked, relevant, 3),
      rr: reciprocalRank(ranked, relevant),
      ndcg5: ndcgAtK(ranked, relevant, 5),
    };
  });

  const mean = (key: keyof (typeof perQuery)[number]) =>
    perQuery.reduce((s, r) => s + (r[key] as number), 0) / perQuery.length;

  const metrics = {
    corpusSize: corpus.length,
    queries: perQuery.length,
    "P@1": +mean("p1").toFixed(3),
    "P@3": +mean("p3").toFixed(3),
    "Recall@3": +mean("recall3").toFixed(3),
    MRR: +mean("rr").toFixed(3),
    "nDCG@5": +mean("ndcg5").toFixed(3),
  };

  it("标注集中的文档 id 都能在语料里找到（防止标注与语料脱节）", () => {
    const ids = new Set(corpus.map((d) => d.id));
    const dangling = evalSet.queries.flatMap((q) => q.relevant.filter((id) => !ids.has(id)));
    expect(dangling).toEqual([]);
  });

  it("产出指标报告", () => {
    writeFileSync(
      "scripts/retrieval_eval_results.json",
      JSON.stringify({ metrics, perQuery }, null, 2) + "\n",
      "utf-8"
    );
    expect(metrics.queries).toBe(18);
  });

  // 回归护栏：改写前中文查询得分恒为 0，MRR 约等于随机排序
  it("MRR 不低于 0.60", () => expect(metrics.MRR).toBeGreaterThanOrEqual(0.6));
  it("P@1 不低于 0.50", () => expect(metrics["P@1"]).toBeGreaterThanOrEqual(0.5));
  it("Recall@3 不低于 0.45", () => expect(metrics["Recall@3"]).toBeGreaterThanOrEqual(0.45));
});
