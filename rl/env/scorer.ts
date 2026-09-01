/**
 * 确定性项目打分器
 *
 * 产品版用 Claude 打分（/api/recommend）；RL 环境里每次 rollout 都调商业大模型
 * 既贵又不可复现，所以环境内用确定性规则打分——同样输入永远同样输出，
 * 训练实验可复现，reward 不被外部模型的随机性污染。
 */

import type { Ride, RideScore, UserProfile, LiveWaitData } from "@/types";

export function scoreRides(
  rides: Ride[],
  profile: UserProfile,
  live: LiveWaitData[]
): RideScore[] {
  const minKidHeight = (profile.kids ?? []).length
    ? Math.min(...profile.kids.map((k) => k.heightCm))
    : null;

  const scored = rides.map((ride) => {
    const liveWait = live.find((w) => w.rideId === ride.id)?.waitMinutes ?? ride.waitTime ?? 30;

    // 档案匹配
    let match = 50;
    if (profile.mode === "thrill") match += (ride.thrillScore - 3) * 12;
    if (profile.mode === "family" || profile.mode === "casual") match += (ride.kidsScore - 3) * 10;
    if (ride.tags.includes("must-do")) match += 15;
    if (minKidHeight !== null && ride.heightRequirement && minKidHeight < ride.heightRequirement) {
      match = 0; // 孩子身高不够，直接排除
    }
    if (ride.thrillScore > profile.thrillLevel + 1) match -= 20;

    // 等待惩罚
    const waitScore = Math.max(0, 100 - (liveWait ?? 30) * 1.2);
    const overall = Math.round(Math.max(0, Math.min(100, match * 0.7 + waitScore * 0.3)));

    return { ride, overall, match };
  });

  const sorted = [...scored].sort((a, b) => b.overall - a.overall);
  const mustDoCut = sorted[Math.floor(sorted.length * 0.25)]?.overall ?? 70;
  const worthItCut = sorted[Math.floor(sorted.length * 0.6)]?.overall ?? 50;

  return scored.map(({ ride, overall, match }) => ({
    rideId: ride.id,
    overallScore: overall,
    waitScore: 0,
    sentimentScore: 0,
    profileMatchScore: match,
    reasoning: "deterministic-env-scorer",
    recommended: overall >= worthItCut && match > 0,
    priority:
      match === 0 ? "skip"
      : overall >= mustDoCut ? "must-do"
      : overall >= worthItCut ? "worth-it"
      : "if-time",
  }));
}
