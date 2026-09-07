"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type RatingTarget = "ride" | "restaurant";
type RatingStore = {
  ratings: Record<string, number>;
  setRating: (type: RatingTarget, id: string, rating: number) => void;
};

export const ratingKey = (type: RatingTarget, id: string) => `${type}:${id}`;

export const useUserRatingStore = create<RatingStore>()(
  persist(
    (set) => ({
      ratings: {},
      setRating: (type, id, rating) => set((state) => ({
        ratings: { ...state.ratings, [ratingKey(type, id)]: Math.max(1, Math.min(5, Math.round(rating))) },
      })),
    }),
    { name: "disney-user-ratings-v1" }
  )
);
