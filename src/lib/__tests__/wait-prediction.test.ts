import { describe, it, expect } from "vitest";
import { predictWait, predictAll, MIN_SAMPLES, Snapshot } from "../wait-prediction";

const NOW = new Date("2026-08-22T12:00:00Z");

/** 构造 n 天前、指定时刻、固定等待时长的一批快照。 */
function snaps(rideId: string, daysAgo: number[], wait: number, hourUTC = 12): Snapshot[] {
  return daysAgo.map((d) => {
    const ts = new Date(NOW.getTime() - d * 86_400_000);
    ts.setUTCHours(hourUTC, 0, 0, 0);
    return { ts: ts.toISOString(), rideId, wait };
  });
}

const localNoon = () => {
  const d = new Date(NOW);
  d.setUTCHours(12, 0, 0, 0);
  return d.getHours() * 60 + d.getMinutes();
};

describe("样本量门槛", () => {
  it("样本不足时返回 null，由调用方回退到快照外推", () => {
    const few = snaps("tron", [1, 2, 3], 60);
    expect(few.length).toBeLessThan(MIN_SAMPLES);
    expect(predictWait(few, "2026-08-25", localNoon(), NOW)).toBeNull();
  });

  it("全为 null（闭园）的快照不计入样本", () => {
    const closed: Snapshot[] = Array.from({ length: 20 }, (_, i) => ({
      ts: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
      rideId: "tron",
      wait: null,
    }));
    expect(predictWait(closed, "2026-08-25", localNoon(), NOW)).toBeNull();
  });
});

describe("加权预测", () => {
  it("所有样本相同时，预测值等于该值（工作日无系数）", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 60);
    const p = predictWait(data, "2026-08-19", localNoon(), NOW)!; // 周三
    expect(p.predictedWait).toBe(60);
  });

  it("周末乘 1.2", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50);
    expect(predictWait(data, "2026-08-22", localNoon(), NOW)!.predictedWait).toBe(60);
  });

  it("节假日乘 1.4", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50);
    expect(predictWait(data, "2026-10-01", localNoon(), NOW)!.predictedWait).toBe(70);
  });

  it("近期数据权重更高：近 7 日偏高会把预测拉高于全量均值", () => {
    const recent = snaps("tron", [1, 2, 3, 4, 5], 100);
    const old = snaps("tron", [30, 32, 34, 36, 38], 20);
    const all = [...recent, ...old];
    const p = predictWait(all, "2026-08-19", localNoon(), NOW)!;
    const plainMean = 60;
    expect(p.predictedWait).toBeGreaterThan(plainMean);
  });

  it("缺失成分时按剩余权重归一化，而不是把预测按比例调低", () => {
    // 全部样本都在 28 天以前：近7日与近4周同星期两项都缺，只剩基线
    const onlyOld = snaps("tron", [40, 42, 44, 46, 48, 50, 52, 54, 56, 58], 80);
    const p = predictWait(onlyOld, "2026-08-19", localNoon(), NOW)!;
    // 若不归一化，只剩 0.2 权重会得到 80 × 0.2 = 16
    expect(p.predictedWait).toBe(80);
  });

  it("预测值不为负", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0);
    expect(predictWait(data, "2026-08-19", localNoon(), NOW)!.predictedWait).toBe(0);
  });
});

describe("置信度", () => {
  it("样本少时为 low", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9], 60);
    expect(predictWait(data, "2026-08-19", localNoon(), NOW)!.confidence).toBe("low");
  });

  it("样本充足且三项成分齐全时为 high", () => {
    const days = Array.from({ length: 70 }, (_, i) => i % 28);
    const data = snaps("tron", days, 60);
    expect(predictWait(data, "2026-08-19", localNoon(), NOW)!.confidence).toBe("high");
  });

  it("basis 说明样本量与成分，便于 UI 如实呈现依据", () => {
    const data = snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 60);
    const p = predictWait(data, "2026-08-19", localNoon(), NOW)!;
    expect(p.basis).toMatch(/个样本/);
    expect(p.basis).toMatch(/近7日/);
  });
});

describe("predictAll", () => {
  it("按项目分组，样本不足的项目不出现在结果里", () => {
    const data = [
      ...snaps("tron", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 80),
      ...snaps("dumbo", [1, 2], 10),
    ];
    const out = predictAll(data, "2026-08-19", localNoon(), NOW);
    expect(out.map((r) => r.rideId)).toEqual(["tron"]);
  });

  it("空输入返回空数组", () => {
    expect(predictAll([], "2026-08-19", localNoon(), NOW)).toEqual([]);
  });
});
