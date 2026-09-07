"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ProgressStore = {
  completedByDay: Record<string, string[]>;
  hasHydrated: boolean;
  complete: (dayKey: string, itemId: string) => void;
  undo: (dayKey: string, itemId: string) => void;
  clear: (dayKey: string) => void;
  setHasHydrated: (value: boolean) => void;
};

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set) => ({
      completedByDay: {},
      hasHydrated: false,
      complete: (dayKey, itemId) => set((state) => ({
        completedByDay: {
          ...state.completedByDay,
          [dayKey]: [...new Set([...(state.completedByDay[dayKey] ?? []), itemId])],
        },
      })),
      undo: (dayKey, itemId) => set((state) => ({
        completedByDay: {
          ...state.completedByDay,
          [dayKey]: (state.completedByDay[dayKey] ?? []).filter((id) => id !== itemId),
        },
      })),
      clear: (dayKey) => set((state) => ({
        completedByDay: { ...state.completedByDay, [dayKey]: [] },
      })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "disney-day-progress-v1",
      partialize: (state) => ({ completedByDay: state.completedByDay }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
