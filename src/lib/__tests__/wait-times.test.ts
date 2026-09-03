import { describe, it, expect } from "vitest";
import { mapLivePayload, mapQueueTimesPayload, dateFactor, isChineseHoliday } from "../wait-times";

describe("mapLivePayload", () => {
  it("把 themeparks entity UUID 映射为内部 slug", () => {
    const { data } = mapLivePayload("shanghai", {
      liveData: [
        {
          id: "72d2c957-0280-4bfa-b2fc-5c70913a613b",
          entityType: "ATTRACTION",
          status: "OPERATING",
          queue: { STANDBY: { waitTime: 85 } },
          lastUpdated: "2026-08-22T01:00:00Z",
        },
      ],
    });
    // 回归测试：此前直接把 UUID 当 rideId 返回，下游 join 永远落空
    expect(data).toEqual([
      { rideId: "tron", waitMinutes: 85, status: "operating", lastUpdated: "2026-08-22T01:00:00Z" },
    ]);
  });

  it("跳过非 ATTRACTION 实体", () => {
    const { data } = mapLivePayload("shanghai", {
      liveData: [{ id: "72d2c957-0280-4bfa-b2fc-5c70913a613b", entityType: "SHOW", status: "OPERATING" }],
    });
    expect(data).toEqual([]);
  });

  it("统计未收录实体，供映射表漂移时报警", () => {
    const { data, unmappedEntities } = mapLivePayload("shanghai", {
      liveData: [
        { id: "全新项目-尚未收录", entityType: "ATTRACTION", status: "OPERATING", queue: { STANDBY: { waitTime: 20 } } },
      ],
    });
    expect(data).toEqual([]);
    expect(unmappedEntities).toBe(1);
  });

  it("关闭中的项目 waitMinutes 为 null 而非 0", () => {
    const { data } = mapLivePayload("shanghai", {
      liveData: [{ id: "72d2c957-0280-4bfa-b2fc-5c70913a613b", entityType: "ATTRACTION", status: "CLOSED" }],
    });
    expect(data[0].waitMinutes).toBeNull();
    expect(data[0].status).toBe("closed");
  });

  it("空响应体不抛异常", () => {
    expect(mapLivePayload("shanghai", {}).data).toEqual([]);
    expect(mapLivePayload("shanghai", null).data).toEqual([]);
  });
});

describe("mapQueueTimesPayload", () => {
  const payload = {
    lands: [{ rides: [{ id: 2985, name: "TRON", wait_time: 100 }] }],
    rides: [{ id: 2996, name: "Pirates", wait_time: 20 }],
  };

  it("同时读取 lands 内与顶层的 rides", () => {
    const out = mapQueueTimesPayload("shanghai", payload, "2026-08-19"); // 周三
    expect(out.map((r) => r.rideId).sort()).toEqual(["pirates", "tron"]);
  });

  it("工作日不加系数", () => {
    const out = mapQueueTimesPayload("shanghai", payload, "2026-08-19");
    expect(out.find((r) => r.rideId === "tron")!.predictedWait).toBe(100);
  });

  it("周末乘 1.2", () => {
    const out = mapQueueTimesPayload("shanghai", payload, "2026-08-22"); // 周六
    expect(out.find((r) => r.rideId === "tron")!.predictedWait).toBe(120);
  });

  it("节假日乘 1.4，且优先于周末系数", () => {
    const out = mapQueueTimesPayload("shanghai", payload, "2026-10-03"); // 国庆，恰逢周六
    expect(out.find((r) => r.rideId === "tron")!.predictedWait).toBe(140);
  });

  it("未收录的 Queue-Times 项目被丢弃而不是伪造 slug", () => {
    const out = mapQueueTimesPayload("shanghai", { rides: [{ id: 99999, wait_time: 30 }] }, "2026-08-19");
    expect(out).toEqual([]);
  });

  it("置信度标为 low —— 这是快照外推，不是历史回归", () => {
    const out = mapQueueTimesPayload("shanghai", payload, "2026-08-19");
    expect(out.every((r) => r.confidence === "low")).toBe(true);
  });
});

describe("dateFactor / isChineseHoliday", () => {
  it("国庆与劳动节识别为节假日", () => {
    expect(isChineseHoliday("2026-10-01")).toBe(true);
    expect(isChineseHoliday("2026-05-01")).toBe(true);
    expect(isChineseHoliday("2026-08-19")).toBe(false);
  });

  it("系数按 节假日 > 周末 > 工作日 排序", () => {
    expect(dateFactor("2026-10-03").value).toBe(1.4);
    expect(dateFactor("2026-08-22").value).toBe(1.2);
    expect(dateFactor("2026-08-19").value).toBe(1.0);
  });
});

describe("闭园时段的快照外推", () => {
  it("未开放的项目不产生预测，而不是记为 0 分钟等待", () => {
    // 回归测试：闭园时 Queue-Times 的 wait_time 全是 0，照单全收会让行程里
    // 每个项目都写"预计等待 0 分钟"、尊享卡"节省约 0 分钟"——
    // 看起来像正常结果，实际毫无信息量
    const out = mapQueueTimesPayload(
      "shanghai",
      { rides: [{ id: 2985, wait_time: 0, is_open: false }, { id: 2996, wait_time: 25, is_open: true }] },
      "2026-08-19"
    );
    expect(out.map((r) => r.rideId)).toEqual(["pirates"]);
  });

  it("wait_time 缺失的项目同样跳过", () => {
    const out = mapQueueTimesPayload("shanghai", { rides: [{ id: 2985, is_open: true }] }, "2026-08-19");
    expect(out).toEqual([]);
  });

  it("全园闭园时返回空列表，由调用方回退到项目静态基准", () => {
    const out = mapQueueTimesPayload(
      "shanghai",
      { rides: [{ id: 2985, wait_time: 0, is_open: false }, { id: 2996, wait_time: 0, is_open: false }] },
      "2026-08-19"
    );
    expect(out).toEqual([]);
  });
});
