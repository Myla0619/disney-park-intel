/**
 * 本地规则评分
 *
 * 不调用模型，纯函数，浏览器端也能直接跑。用途有两个：
 *   1. 首屏立即出行程——Claude 评分要 20 秒，期间先用规则分排出一版可用行程，
 *      模型结果回来后再无缝替换
 *   2. 未配置 API key 或模型调用失败时的降级
 *
 * 规则很粗：等待时间 + 模式匹配各占一半，身高不足直接判 skip。它不试图取代模型
 * 评分，只保证"任何时候都有一份能用的行程"。
 */

import { UserProfile, Ride, RideScore } from "@/types";
import { isHeightBlocked, minKidHeightCm } from "./height";

export function generateFallbackScore(ride: Ride, profile: UserProfile): RideScore {
  const heightBlocked = isHeightBlocked(ride, profile);

  const waitScore = ride.waitTime == null ? 50 : Math.max(0, 100 - ride.waitTime);
  const thrillMatch =
    profile.mode === "thrill"
      ? ride.thrillScore * 20
      : profile.mode === "family"
      ? ride.kidsScore * 20
      : 60;

  const overallScore = heightBlocked ? 10 : Math.round((waitScore + thrillMatch) / 2);

  return {
    rideId: ride.id,
    overallScore,
    waitScore,
    sentimentScore: 70,
    profileMatchScore: thrillMatch,
    reasoning: heightBlocked
      ? `身高要求 ${ride.heightRequirement}cm，团队中最矮的孩子 ${minKidHeightCm(profile)}cm，无法乘坐。`
      : `符合你的${profile.mode === "family" ? "亲子" : profile.mode === "thrill" ? "刺激" : "休闲"}游玩偏好。`,
    recommended: overallScore >= 60 && !heightBlocked,
    priority: heightBlocked ? "skip" : overallScore >= 75 ? "must-do" : overallScore >= 55 ? "worth-it" : "if-time",
  };
}

/** 为整批项目生成规则评分，供首屏立即排程使用。 */
export function scoreRidesLocally(rides: Ride[], profile: UserProfile): RideScore[] {
  return rides.map((r) => generateFallbackScore(r, profile));
}
