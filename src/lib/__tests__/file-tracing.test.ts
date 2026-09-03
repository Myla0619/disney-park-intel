import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * 校验「运行时读取的数据目录」与「next.config.js 里声明的追踪目录」一致。
 *
 * 漏声明是一类特别隐蔽的错误：本地开发一切正常（能直接读文件系统），部署到
 * Serverless 后文件不在产物里，功能静默降级且不报错——历史预测退回快照外推、
 * 真实评论退回人工示例，从外部完全看不出异常。
 */

const ROOT = process.cwd();

function declaredDirs(): string[] {
  const config = readFileSync(path.join(ROOT, "next.config.js"), "utf-8");
  return [...config.matchAll(/"\.\/(data\/[\w-]+)\/\*\*"/g)].map((m) => m[1]);
}

function runtimeDirs(): string[] {
  const libDir = path.join(ROOT, "src", "lib");
  const dirs = new Set<string>();
  for (const file of readdirSync(libDir)) {
    if (!file.endsWith(".ts")) continue;
    const src = readFileSync(path.join(libDir, file), "utf-8");
    for (const m of src.matchAll(/process\.cwd\(\),\s*"(\w+)",\s*"([\w-]+)"/g)) {
      dirs.add(`${m[1]}/${m[2]}`);
    }
  }
  return [...dirs];
}

describe("Serverless 产物的文件追踪", () => {
  it("每个运行时读取的数据目录都已在 next.config.js 中声明", () => {
    const declared = declaredDirs();
    const missing = runtimeDirs().filter((d) => !declared.includes(d));
    // 回归测试：data/reviews 曾被遗漏，导致线上 280 条真实评论语料读不到，
    // 静默退回人工示例数据
    expect(missing, `以下目录在运行时读取但未声明追踪: ${missing.join(", ")}`).toEqual([]);
  });

  it("确实探测到了运行时读取的目录（防止正则失配导致空跑通过）", () => {
    expect(runtimeDirs().length).toBeGreaterThanOrEqual(2);
    expect(runtimeDirs()).toContain("data/reviews");
    expect(runtimeDirs()).toContain("data/wait-snapshots");
  });
});
