/** Verify the delivered structured plan, not just a previous tool's self-report. */
import type { Trajectory } from "../agent/loop";
import type { SeedTask } from "../data/seeds";
import type { ItineraryItem } from "@/types";
import { checkItinerary } from "../env/constraints";
import { buildProfileForReward } from "./profile";

export function needsPlan(t: Trajectory, task: Pick<SeedTask, "category">): boolean {
  return task.category === "plan_request" || t.steps.some(s => s.parsed.toolCall?.name === "plan_itinerary");
}

export function normalizePlan(items: unknown): ItineraryItem[] {
  if (!Array.isArray(items) || !items.length) throw new Error("missing itinerary");
  return items.map(x => {
    if (!x || typeof x !== "object" || typeof x.itemId !== "string" || !x.itemId ||
        typeof x.time !== "string" || typeof (x.endTime ?? x.end) !== "string" ||
        typeof (x.itemName ?? x.name) !== "string" || typeof x.type !== "string" ||
        (x.endTime !== undefined && x.end !== undefined && x.endTime !== x.end) ||
        (x.itemName !== undefined && x.name !== undefined && x.itemName !== x.name) ||
        (x.llType !== undefined && x.ll !== undefined && x.llType !== x.ll)) {
      throw new Error("incomplete or conflicting itinerary fields");
    }
    return { ...x, endTime: x.endTime ?? x.end, itemName: x.itemName ?? x.name,
      llType: x.llType ?? x.ll ?? null } as ItineraryItem;
  });
}

function signature(items: ItineraryItem[]): string {
  return JSON.stringify(items.map(x => [x.itemId, x.itemName, x.type, x.time, x.endTime, x.area, x.llType ?? null]));
}

export function verifyFinalPlan(t: Trajectory, task: SeedTask) {
  const fail = (detail: string) => ({ passed: false, score: 0, detail });
  try {
    if (!t.answer) return fail("无最终答案");
    const body = JSON.parse(t.answer);
    if (!body || typeof body.summary !== "string" || !body.summary.trim()) return fail("规划答案缺少summary");
    const final = normalizePlan(body.itinerary);
    const plan = [...t.steps].reverse().find(s => s.parsed.toolCall?.name === "plan_itinerary" && s.toolResult?.ok);
    if (!plan?.toolResult?.ok) return fail("没有真实规划工具结果");
    const executed = normalizePlan((plan.toolResult.result as any)?.items);
    if (signature(final) !== signature(executed)) return fail("最终行程与最后成功工具结果不一致，请重新规划再交付");
    const checks = checkItinerary(final, buildProfileForReward(task.profile, task.parkId));
    return { passed: checks.passed,
      score: checks.checks.filter(c => c.pass).length / checks.checks.length,
      detail: checks.checks.filter(c => !c.pass).map(c => `${c.check}: ${c.detail}`).join("；") || "最终结构化行程已校验" };
  } catch {
    return fail("规划答案须为JSON对象，含summary和完整itinerary；不能只写自由文本");
  }
}
