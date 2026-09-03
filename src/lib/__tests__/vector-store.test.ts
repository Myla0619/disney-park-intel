import { describe, it, expect } from "vitest";
import { VectorStore, indexReviews, searchReviews, tokenize } from "../vector-store";
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

describe("中文分词", () => {
  it("CJK 切成字符二元组", () => {
    expect(tokenize("适合孩子")).toEqual(["适合", "合孩", "孩子"]);
  });

  it("单字 CJK 词保留，否则单字查询检索不到", () => {
    expect(tokenize("贵")).toEqual(["贵"]);
  });

  it("拉丁词整体保留，不切二元组", () => {
    expect(tokenize("amazing ride")).toEqual(["amazing", "ride"]);
  });

  it("中英混排按类型切段后分别处理", () => {
    expect(tokenize("97cm就可以坐")).toEqual(["97cm", "就可", "可以", "以坐"]);
  });

  it("标点与空白不产生 token", () => {
    expect(tokenize("！！！   ，。")).toEqual([]);
  });
});

describe("真实中文评论上的检索（无空格）", () => {
  // 回归测试：改写前分词按空白切，中文评论整条变成一个 token，
  // 所有查询得分恒为 0，检索退化成按索引顺序返回。
  const docs = [
    { text: "创极速光轮真的是来上海迪士尼必玩！速度超快，建议一开门就冲" },
    { text: "带孩子来玩，小孩不够高进不去，好可惜。建议提前看好身高要求" },
    { text: "七个小矮人是我们家孩子最喜欢的！97cm就可以坐，排队大概45分钟" },
  ];

  it("查询「适合孩子吗」命中讲孩子的两条，而不是全部得 0 分", () => {
    const store = new VectorStore<{ text: string }>();
    store.index(docs);
    const out = store.search("适合孩子吗", 3);
    expect(out[0].score).toBeGreaterThan(0);
    expect(out[0].text).toContain("孩子");
    expect(out[2].score).toBe(0); // 不相关的那条仍应为 0
  });

  it("查询「身高限制」命中提到身高的那条", () => {
    const store = new VectorStore<{ text: string }>();
    store.index(docs);
    expect(store.search("身高限制", 1)[0].text).toContain("身高");
  });

  it("查询「排队多久」命中提到排队时长的那条", () => {
    const store = new VectorStore<{ text: string }>();
    store.index(docs);
    expect(store.search("排队多久", 1)[0].text).toContain("排队");
  });
});
