"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { DiningPlan, Restaurant, UserProfile } from "@/types";
import { recommendedMealTime, isPeakTime, inferMealType, mealDuration } from "@/lib/dining";

const MEAL_LABEL: Record<DiningPlan["mealType"], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  snack: "下午茶",
  dinner: "晚餐",
};

type Props = {
  restaurant: Restaurant;
  profile: Pick<
    UserProfile,
    "arrivalTime" | "departureTime" | "diningPreference" | "watchFireworks" | "fireworksTime"
  >;
  plan: DiningPlan | undefined;
  onChange: (plan: DiningPlan) => void;
};

/**
 * 单家餐厅的用餐时间设置。
 *
 * 默认给推荐时间而不是留空——多数人并不知道几点吃能避开高峰，让他从一个合理值
 * 上微调，比让他对着空白输入框猜要好。
 *
 * 需预约的餐厅额外提供「已预约」开关：勾上之后该时段在排程里变成硬约束，
 * 其它项目必须绕开，而不是当作可浮动的用餐时段。
 */
export default function DiningPlanPicker({ restaurant, profile, plan, onChange }: Props) {
  const mealType = plan?.mealType ?? inferMealType(restaurant);
  const recommended = recommendedMealTime(mealType, profile as UserProfile);
  const time = plan?.time ?? recommended;
  const isReservation = plan?.isReservation ?? false;
  const peak = isPeakTime(mealType, time);
  const duration = mealDuration(profile, mealType);

  const emit = (patch: Partial<DiningPlan>) =>
    onChange({
      restaurantId: restaurant.id,
      mealType,
      time,
      isReservation,
      ...patch,
    });

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs text-white/70">{MEAL_LABEL[mealType]}时间</span>

        <input
          type="time"
          value={time}
          onChange={(e) => emit({ time: e.target.value })}
          className="rounded-md border border-white/15 bg-slate-800 px-2 py-1 text-sm text-white [color-scheme:dark]"
        />

        <span className="text-xs text-white/35">用时约 {duration} 分钟</span>

        {time !== recommended && (
          <button
            type="button"
            onClick={() => emit({ time: recommended })}
            className="text-xs text-blue-300 underline underline-offset-2"
          >
            用推荐 {recommended}
          </button>
        )}
      </div>

      {peak && (
        <p className="flex items-start gap-1.5 text-xs text-amber-300/90">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          这个点是用餐高峰，等位时间会明显变长。推荐 {recommended}。
        </p>
      )}

      {restaurant.requiresReservation && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={isReservation}
            onChange={(e) => emit({ isReservation: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-amber-400"
          />
          <span>
            我已经订好这个时间
            <span className="mt-0.5 block text-white/40">
              勾选后行程会把这个时段固定下来，其它项目绕开安排——预约改不了，得让别的让路
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
