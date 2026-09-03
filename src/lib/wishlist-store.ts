/**
 * 「想去」清单
 *
 * 用户在项目、拍照点、商店的详情里勾选想去的条目，路径规划会大幅提权，
 * 使其几乎必然排入行程。这是把选择权交回用户的一条通道——算法给的是默认建议，
 * 但"我今天就是要拍这个机位"应该压过任何评分。
 *
 * 与 profile 分开存储：清单会频繁增删，而 profile 是一次性设定，
 * 混在一起会让每次勾选都触发行程重算所依赖的 profile 变更。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type WishlistStore = {
  /** 项目 / 机位 / 商店的 id */
  ids: string[];
  hasHydrated: boolean;
  toggle: (id: string) => void;
  has: (id: string) => boolean;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      ids: [],
      hasHydrated: false,
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
        })),
      has: (id) => get().ids.includes(id),
      clear: () => set({ ids: [] }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "disney-wishlist-v1",
      // 水合标记是运行期状态，存进去会让它一开始就是 true
      partialize: (s) => ({ ids: s.ids }),
      onRehydrateStorage: () => (s) => s?.setHasHydrated(true),
    }
  )
);
