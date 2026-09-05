import assert from "node:assert/strict";
import { runEpisode, makeDirectCaller, type LLM } from "../agent/loop";
import { verifyFinalPlan } from "./plan-evidence";
import { checkItinerary } from "../env/constraints";
import { buildProfileForReward } from "./profile";
import { scoreTrajectory } from "./reward";
import { cleanTrajectories, type TrajectoryRecord } from "../data/clean";
import type { SeedTask } from "../data/seeds";

async function main() {
  const task: SeedTask = { id: "plan-test", parkId: "shanghai", query: "规划一天", category: "plan_request",
    source: "template", difficultyHint: "medium", profile: { kids: [{ age: 5, heightCm: 110 }], visitDate: "2026-09-01" } };
  const llm: LLM = { async chat(messages) {
    if (messages.length === 2) return `<think>规划</think><tool_call>${JSON.stringify({ name: "plan_itinerary", arguments: { park_id: "shanghai", profile: task.profile } })}</tool_call>`;
    const result = JSON.parse(messages.at(-1)!.content.match(/<tool_response>([\s\S]*?)<\/tool_response>/)![1]);
    assert.equal(result.ok, true);
    return `<think>依据工具交付</think><answer>${JSON.stringify({ summary: "完整行程见结构化时间表。", itinerary: result.result.items })}</answer>`;
  } };
  const t = await runEpisode(llm, task, makeDirectCaller({ mode: "sandbox", snapshotAt: "2026-09-01T23:59:59Z" }));
  assert.equal(t.toolCallCount, 1);
  assert.equal(verifyFinalPlan(t, task).passed, true);
  const record: TrajectoryRecord = { taskId: task.id, category: task.category, source: task.source,
    difficultyHint: task.difficultyHint, query: task.query, parkId: task.parkId, profile: task.profile, teacher: "scripted",
    ...t, toolResults: t.steps.map(s => ({ call: s.parsed.toolCall, ok: s.toolResult?.ok ?? null })) };
  assert.equal(cleanTrajectories([record]).samples.length, 1);
  const tampered = JSON.parse(t.answer!);
  tampered.itinerary[0].time = "00:00";
  const bad = { ...t, answer: JSON.stringify(tampered) };
  assert.equal(verifyFinalPlan(bad, task).passed, false);
  const reward = await scoreTrajectory(bad, task, { score: async () => ({ score: 1, detail: "perfect prose" }) });
  assert.ok(reward.total <= 0.2);
  const badMessages = structuredClone(t.messages);
  badMessages[badMessages.length - 1].content = `<think>改写</think><answer>${bad.answer}</answer>`;
  assert.equal(cleanTrajectories([{ ...record, answer: bad.answer, messages: badMessages }]).rejected[0].reason, "invalid_final_plan");
  const profile = buildProfileForReward(task.profile, task.parkId);
  const items = JSON.parse(t.answer!).itinerary;
  const unknown = structuredClone(items);
  unknown.find((x: any) => x.type === "ride").itemId = "made-up-ride";
  assert.equal(checkItinerary(unknown, profile).checks.find(c => c.check === "known_ride")!.pass, false);
  assert.equal(checkItinerary(items, { ...profile, watchFireworks: true }).checks.find(c => c.check === "anchors")!.pass, false);
  assert.equal(verifyFinalPlan({ ...t, answer: "时间表正确，请放心游玩。" }, task).passed, false);
  console.log("PASS final-plan evidence: real sandbox rollout, cleaning, tampering gate, unknown IDs, missing anchors, unstructured output");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
