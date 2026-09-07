import { describe, expect, it } from "vitest";
import { reviewMatches, reviewSnippet } from "../review-snippet";

describe("reviewSnippet", () => {
  it("centers the excerpt on the project instead of the post opening", () => {
    const text = `${"行前准备和交通说明。".repeat(18)}热力追踪排队很快，场景也很沉浸。${"其他项目介绍。".repeat(18)}`;
    const result = reviewSnippet(text, ["疯狂动物城：热力追踪"], 90);
    expect(result).toContain("热力追踪排队很快");
    expect(result.startsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(92);
    expect(reviewMatches(text, ["疯狂动物城：热力追踪"])).toBe(true);
  });

  it("uses the user query for agent search snippets", () => {
    const text = `${"整体游玩记录。".repeat(20)}带孩子坐完全程不害怕，身高限制要提前确认。`;
    expect(reviewSnippet(text, ["适合孩子吗"], 80)).toContain("孩子坐完全程不害怕");
  });

  it("keeps short text unchanged and falls back safely", () => {
    expect(reviewSnippet("短评", ["项目"], 80)).toBe("短评");
    expect(reviewSnippet("无关内容".repeat(30), ["不存在的词"], 30)).toHaveLength(30);
    expect(reviewMatches("只有交通攻略", ["热力追踪"])).toBe(false);
  });

  it("does not assign a generic post from a coincidental two-character overlap", () => {
    expect(reviewMatches("动物园一日游，天气很热，体力消耗较大", ["疯狂动物城热力追踪"])).toBe(false);
    expect(reviewMatches("热力追踪排队入口在疯狂动物城内", ["疯狂动物城热力追踪", "热力追踪值得玩吗"])).toBe(true);
  });
});
