/**
 * 身高准入判定
 *
 * 单一事实来源：用户在 Onboarding 里逐个孩子填写的真实身高（KidInfo.heightCm），
 * 不做任何由年龄推算身高的估算——迪士尼的身高限制是硬性卡尺，估算会给出错误结论。
 */

import { Ride, UserProfile } from "@/types";

type HasKids = Pick<UserProfile, "kids">;

/** 未带孩子时返回 null（表示无身高约束）。 */
export function minKidHeightCm(profile: HasKids): number | null {
  const heights = (profile.kids ?? []).map((k) => k.heightCm).filter((h) => Number.isFinite(h));
  return heights.length ? Math.min(...heights) : null;
}

/** 是否存在同行儿童因身高不足而无法乘坐该项目。 */
export function isHeightBlocked(ride: Pick<Ride, "heightRequirement">, profile: HasKids): boolean {
  if (ride.heightRequirement == null) return false;
  const minH = minKidHeightCm(profile);
  // 恰好等于限制值即可乘坐（迪士尼判定为 >=）。
  return minH != null && minH < ride.heightRequirement;
}
