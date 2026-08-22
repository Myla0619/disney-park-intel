import { describe, it, expect, beforeEach } from "vitest";
import { loadCorpus, corpusTargets, __clearCorpusCache } from "../review-store";
import { getReviews } from "../reviews";

beforeEach(() => __clearCorpusCache());

describe("语料读取", () => {
  it("不存在的目标返回 null", () => {
    expect(loadCorpus("从未抓取过的项目")).toBeNull();
  });

  it("挡住路径穿越——targetId 来自查询参数", () => {
    expect(loadCorpus("../../package")).toBeNull();
    expect(loadCorpus("../../../etc/passwd")).toBeNull();
    expect(loadCorpus("a/b")).toBeNull();
  });

  it("corpusTargets 返回数组（语料为空时也不抛异常）", () => {
    expect(Array.isArray(corpusTargets())).toBe(true);
  });
});

describe("取数优先级与降级标注", () => {
  it("没有真实语料时回退到示例数据，并明确置 fallback", async () => {
    const r = await getReviews("tron", "ride");
    if (!corpusTargets().includes("tron")) {
      expect(r.fallback).toBe(true);
      expect(r.sources).toEqual(["seed"]);
      // 关键：降级时不能声称有抓取时间
      expect(r.scrapedAt).toBeUndefined();
    } else {
      expect(r.fallback).toBe(false);
      expect(r.sources).toContain("xiaohongshu");
      expect(r.scrapedAt).toBeTruthy();
    }
  });

  it("完全没有语料也没有示例的目标返回空结果而不是报错", async () => {
    const r = await getReviews("完全不存在的目标", "ride");
    expect(r.reviews).toEqual([]);
    expect(r.summary.total).toBe(0);
    expect(r.fallback).toBe(true);
  });

  it("评论按日期倒序", async () => {
    const r = await getReviews("tron", "ride");
    const dates = r.reviews.map((x) => new Date(x.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});
