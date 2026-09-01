/** 补全任务档案默认值（与 env/tools.ts 的 buildProfile 保持一致的默认策略） */

import type { UserProfile } from "@/types";
import { getParkById } from "@/lib/parks-data";

export function buildProfileForReward(partial: Partial<UserProfile>, parkId: string): UserProfile {
  return {
    mode: "casual", kids: [], thrillLevel: 3,
    arrivalTime: "09:00", departureTime: "21:30",
    mobilityNeeds: false, llPackage: "none",
    singlePassRides: [], bundle3Rides: [],
    watchParade: false, paradeTime: getParkById(parkId)?.defaultParadeTime ?? "15:45",
    watchFireworks: false, fireworksTime: getParkById(parkId)?.defaultFireworksTime ?? "21:00",
    visitDate: new Date().toISOString().slice(0, 10),
    park: parkId, routeProfile: "balanced", diningPreference: "normal",
    focusPhoto: false, focusShopping: false, selectedRestaurants: [],
    ...partial,
  };
}
