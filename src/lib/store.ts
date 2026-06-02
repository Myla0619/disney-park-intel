import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserProfile } from "@/types";

type ProfileStore = {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  clearProfile: () => void;
};

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (p) => set({ profile: p }),
      clearProfile: () => set({ profile: null }),
    }),
    { name: "disney-profile-v3" }
  )
);
