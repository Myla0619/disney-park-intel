/**
 * 行程缓存
 *
 * 此前只要 dashboard 重新挂载就会整轮重算——点进项目详情再返回、切换标签页、
 * 甚至误触后退，都要再等一次完整规划。用户什么都没改，凭什么重算。
 *
 * 这里按输入指纹缓存：只有真正影响结果的输入变了才重新规划。
 * 指纹之外还看新鲜度，因为实时排队数据会变——当天规划的结果比提前规划的更容易过期。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ItineraryItem, ParkHours, RideScore, UserProfile } from "@/types";

/** 当天行程依赖实时排队，过了这个时长就该刷新。 */
const TODAY_TTL_MS = 10 * 60 * 1000;
/** 提前规划的行程只依赖预测数据，可以放很久。 */
const FUTURE_TTL_MS = 12 * 60 * 60 * 1000;

export type CachedPlan = {
  fingerprint: string;
  itinerary: ItineraryItem[];
  scores: RideScore[];
  parkHours: ParkHours | null;
  isToday: boolean;
  /** 已完成到哪一阶段。未到 done 时即使指纹相同也应继续把后续阶段跑完 */
  stage: "quick" | "refined" | "polished";
  computedAt: number;
};

type PlanStore = {
  plan: CachedPlan | null;
  hasHydrated: boolean;
  save: (plan: CachedPlan) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const usePlanStore = create<PlanStore>()(
  persist(
    (set) => ({
      plan: null,
      hasHydrated: false,
      save: (plan) => set({ plan }),
      clear: () => set({ plan: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "disney-plan-v1",
      partialize: (s) => ({ plan: s.plan }),
      onRehydrateStorage: () => (s) => s?.setHasHydrated(true),
    }
  )
);

/**
 * 影响规划结果的输入指纹。
 *
 * 只纳入真正会改变行程的字段——比如 profile 里的 mode/时间/套餐/用餐安排，
 * 以及想去清单与起点区域。像 thrillLevel 这种也会影响评分，一并纳入。
 * 不纳入实时等待数据：那由新鲜度控制，否则每次拉到的秒级差异都会让缓存失效。
 */
export function planFingerprint(
  profile: UserProfile,
  wishlist: string[],
  currentArea: string
): string {
  return JSON.stringify({
    mode: profile.mode,
    thrill: profile.thrillLevel,
    kids: profile.kids,
    mobility: profile.mobilityNeeds,
    arrive: profile.arrivalTime,
    depart: profile.departureTime,
    date: profile.visitDate,
    park: profile.park,
    ll: profile.llPackage,
    sp: profile.singlePassRides,
    b3: profile.bundle3Rides,
    parade: [profile.watchParade, profile.paradeTime],
    fireworks: [profile.watchFireworks, profile.fireworksTime],
    route: profile.routeProfile,
    dining: profile.diningPreference,
    diningPlans: profile.diningPlans ?? [],
    restaurants: profile.selectedRestaurants,
    photo: profile.focusPhoto,
    shopping: profile.focusShopping,
    // 想去清单排序后再比，避免勾选顺序不同导致误判
    wishlist: [...wishlist].sort(),
    area: currentArea,
  });
}

/** 缓存是否仍然可用：指纹一致且未过新鲜度。 */
export function isPlanUsable(plan: CachedPlan | null, fingerprint: string): boolean {
  if (!plan || plan.fingerprint !== fingerprint) return false;
  const ttl = plan.isToday ? TODAY_TTL_MS : FUTURE_TTL_MS;
  return Date.now() - plan.computedAt < ttl;
}
