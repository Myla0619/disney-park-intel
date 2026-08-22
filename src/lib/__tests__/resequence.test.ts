import { describe, it, expect } from "vitest";
import { resequenceItinerary, timeToMin } from "../routing";
import { ItineraryItem } from "@/types";

const item = (
  time: string, endTime: string, itemName: string, extra: Partial<ItineraryItem> = {}
): ItineraryItem =>
  ({
    time, endTime, itemId: itemName, itemName, area: "fantasy",
    estimatedWait: 0, walkMinutes: 0,
    duration: timeToMin(endTime) - timeToMin(time),
    note: "", type: "ride", ...extra,
  }) as ItineraryItem;

const times = (items: ItineraryItem[]) => items.map((i) => `${i.time}-${i.endTime}`);

describe("resequenceItinerary", () => {
  it("空行程原样返回", () => {
    expect(resequenceItinerary([])).toEqual([]);
  });

  it("顺序未变时时间不变", () => {
    const list = [item("09:00", "09:30", "A"), item("09:30", "10:15", "B")];
    expect(times(resequenceItinerary(list))).toEqual(["09:00-09:30", "09:30-10:15"]);
  });

  it("交换后时间重新串起来，不会出现时间倒退", () => {
    // 回归测试：前端此前只交换数组位置、不动时间，于是把晚间项目挪到上午项目前面时，
    // 列表会显示成"22:00 的下一项是 11:00"
    const list = [item("11:00", "11:45", "上午项目"), item("22:00", "22:30", "晚间项目")];
    const swapped = [list[1], list[0]];
    const out = resequenceItinerary(swapped);

    expect(times(out)).toEqual(["11:00-11:30", "11:30-12:15"]);
    for (let i = 0; i < out.length - 1; i++) {
      expect(timeToMin(out[i + 1].time)).toBeGreaterThanOrEqual(timeToMin(out[i].time));
    }
  });

  it("保留每个条目原本占用的时长", () => {
    const list = [item("09:00", "09:20", "短"), item("09:20", "10:20", "长")];
    const out = resequenceItinerary([list[1], list[0]]);
    expect(timeToMin(out[0].endTime) - timeToMin(out[0].time)).toBe(60);
    expect(timeToMin(out[1].endTime) - timeToMin(out[1].time)).toBe(20);
  });

  it("删除中间条目后，后续时间前移填补空缺", () => {
    const list = [item("09:00", "09:30", "A"), item("09:30", "10:00", "B"), item("10:00", "10:30", "C")];
    const out = resequenceItinerary([list[0], list[2]]);
    expect(times(out)).toEqual(["09:00-09:30", "09:30-10:00"]);
  });

  it("锚点时间不可移动——巡游烟花是外部固定场次", () => {
    const list = [
      item("09:00", "09:30", "项目"),
      item("15:45", "16:15", "🎠 花车巡游", { isAnchor: true, type: "parade" }),
    ];
    const out = resequenceItinerary(list);
    expect(out[1].time).toBe("15:45");
    expect(out[1].endTime).toBe("16:15");
  });

  it("跨过锚点后，后续条目从锚点结束时刻续排", () => {
    const list = [
      item("15:45", "16:15", "🎠 花车巡游", { isAnchor: true, type: "parade" }),
      item("09:00", "09:30", "被挪到巡游之后的项目"),
    ];
    const out = resequenceItinerary(list);
    expect(out[0].time).toBe("15:45");
    expect(out[1].time).toBe("16:15");
    expect(out[1].endTime).toBe("16:45");
  });

  it("以第一个条目的开始时间为起点，不会把整个行程平移到 00:00", () => {
    const list = [item("13:00", "13:40", "A"), item("13:40", "14:00", "B")];
    expect(resequenceItinerary([list[1], list[0]])[0].time).toBe("13:00");
  });
});
