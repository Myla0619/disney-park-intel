import { describe, it, expect } from "vitest";
import { VectorStore, indexReviews, searchReviews } from "../vector-store";
import { Review } from "@/types";

const review = (text: string, author = "用户"): Review => ({
  source: "xiaohongshu", author, rating: 5, text,
  date: "2026-01-01", tags: [], sentiment: "positive",
});

describe("VectorStore", () => {
  it("空索引检索返回空数组而不是抛异常", () => {
    expect(new VectorStore<{ text: string }>().search("任意查询")).toEqual([]);
  });

  it("检索出词面重合度最高的文档", () => {
    const store = new VectorStore<{ text: string }>();
    store.index([
      { text: "排队 两小时 太久 了 不值" },
      { text: "小孩 很 喜欢 亲子 项目 推荐" },
      { text: "夜景 出片 拍照 好看" },
    ]);
    expect(store.search("小孩 亲子", 1)[0].text).toContain("亲子");
    expect(store.search("拍照 出片", 1)[0].text).toContain("出片");
  });

  it("topK 限制返回条数", () => {
    const store = new VectorStore<{ text: string }>();
    store.index([{ text: "排队 很久" }, { text: "排队 太久" }, { text: "排队 好久" }]);
    expect(store.search("排队", 2)).toHaveLength(2);
  });

  it("每条结果带 score，且按降序排列", () => {
    const store = new VectorStore<{ text: string }>();
    store.index([{ text: "亲子 推荐 小孩" }, { text: "刺激 过山车 速度" }]);
    const out = store.search("亲子 小孩");
    expect(out[0].score).toBeGreaterThan(0);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it("查询词完全不在词表中时全部得分为 0（不会误报相关）", () => {
    const store = new VectorStore<{ text: string }>();
    store.index([{ text: "排队 很久" }]);
    expect(store.search("完全无关的查询词汇")[0].score).toBe(0);
  });

  it("重新索引会替换掉旧文档，而不是累加", () => {
    const store = new VectorStore<{ text: string }>();
    store.index([{ text: "第一批 文档" }]);
    store.index([{ text: "第二批 文档" }, { text: "另一条 文档" }]);
    expect(store.search("文档", 10)).toHaveLength(2);
  });
});

describe("按项目分片的评论检索", () => {
  it("不同项目的索引互不干扰", () => {
    indexReviews("tron", [review("速度 很快 非常 刺激")]);
    indexReviews("dumbo", [review("适合 幼儿 温和 不 刺激")]);
    expect(searchReviews("tron", "刺激", 5)).toHaveLength(1);
    expect(searchReviews("tron", "刺激", 5)[0].text).toContain("速度");
    expect(searchReviews("dumbo", "刺激", 5)[0].text).toContain("幼儿");
  });

  it("未索引过的项目返回空数组", () => {
    expect(searchReviews("从未索引过的项目", "任意查询")).toEqual([]);
  });
});
