import { describe, it, expect } from "vitest";
import { buildRoute, buildAnchors } from "../routing";
import { getRidesByPark } from "../parks-data";
import { UserProfile, RideScore } from "@/types";

const rides = getRidesByPark("shanghai");
const parkHours = { open: "08:30", close: "22:00", source: "estimated" as const };

const profile = {
  mode: "casual", park: "shanghai", thrillLevel: 3,
  arrivalTime: "09:00", departureTime: "21:00", visitDate: "2026-08-29",
  kids: [], mobilityNeeds: false, llPackage: "none",
  singlePassRides: [], bundle3Rides: [],
  watchParade: false, paradeTime: "15:45", watchFireworks: false, fireworksTime: "21:00",
  routeProfile: "balanced", diningPreference: "normal",
  focusPhoto: false, focusShopping: false, selectedRestaurants: [],
} as unknown as UserProfile;

/** 全部设为最低优先级，这样只有 wishlist 提权能让它们排进来。 */
const lowPriority: RideScore[] = rides.map((r) => ({
  rideId: r.id, overallScore: 40, waitScore: 50, sentimentScore: 50,
  profileMatchScore: 40, reasoning: "", recommended: false, priority: "if-time",
}));

const route = (wishlist?: string[]) =>
  buildRoute({
    rides, scores: lowPriority, historical: [], live: [], profile,
    startArea: "entrance", parkHours,
    anchors: buildAnchors(profile, parkHours),
    wishlist,
  });

describe("「想去」标记", () => {
  it("不传清单时行为不变", () => {
    expect(route().length).toBeGreaterThan(0);
  });

  it("被标记的项目会排进行程", () => {
    // 偏远且低优先级的项目：不标记时通常排不上
    const target = "canoe";
    const ids = route([target]).map((i) => i.itemId);
    expect(ids).toContain(target);
  });

  it("标记多个项目时都会排入", () => {
    const targets = ["canoe", "alice-maze", "jet-packs"];
    const ids = route(targets).map((i) => i.itemId);
    for (const t of targets) expect(ids, `${t} 未排入`).toContain(t);
  });

  it("标记不存在的 id 不会导致崩溃或空行程", () => {
    const items = route(["根本不存在的项目"]);
    expect(items.length).toBeGreaterThan(0);
  });

  it("标记身高不允许的项目时仍然不排入——硬约束不可被偏好覆盖", () => {
    const withKid = { ...profile, mode: "family", kids: [{ age: 5, heightCm: 100 }] } as unknown as UserProfile;
    const items = buildRoute({
      rides, scores: lowPriority, historical: [], live: [], profile: withKid,
      startArea: "entrance", parkHours,
      anchors: buildAnchors(withKid, parkHours),
      wishlist: ["tron"], // 需要 122cm
    });
    expect(items.map((i) => i.itemId)).not.toContain("tron");
  });

  it("标记不会破坏时间单调性", () => {
    const items = route(["canoe", "alice-maze", "jet-packs", "pirates"]);
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i].time.split(":").map(Number);
      const b = items[i + 1].time.split(":").map(Number);
      expect(b[0] * 60 + b[1]).toBeGreaterThanOrEqual(a[0] * 60 + a[1]);
    }
  });
});
