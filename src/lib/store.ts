import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserProfile } from "@/types";

type ProfileStore = {
  profile: UserProfile | null;
  /**
   * 是否已从 localStorage 完成水合。
   *
   * zustand 的 persist 是在挂载之后异步回填的，首次渲染时 profile 一定是 null。
   * 页面若直接据此跳转，用户每次打开都会被弹回 Onboarding 重填一遍——
   * 而园区里反复打开应用正是主要用法。
   */
  hasHydrated: boolean;
  setProfile: (p: UserProfile) => void;
  clearProfile: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      profile: null,
      hasHydrated: false,
      setProfile: (p) => set({ profile: p }),
      clearProfile: () => set({ profile: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "disney-profile-v3",
      // 只持久化档案本身；水合标记是运行期状态，存进去反而会让它一开始就是 true
      partialize: (state) => ({ profile: state.profile }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
