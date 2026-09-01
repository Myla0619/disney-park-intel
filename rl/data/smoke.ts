/**
 * 数据管线冒烟测试（零外部依赖）：种子生成确定性/多样性/去重 + 清洗管线端到端
 * 运行：npm run data:smoke
 */

import { generateSeeds, dedup } from "./seeds";
import { cleanTrajectories, type TrajectoryRecord } from "./clean";
import { runEpisode, ScriptedLLM, makeDirectCaller } from "../agent/loop";

let failed = 0;
function check(cond: boolean, label: string, extra?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else { failed++; console.error(`FAIL ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
}

(async () => {
  // ── 种子生成 ────────────────────────────────────────────────
  const a = generateSeeds("shanghai");
  const b = generateSeeds("shanghai");
  check(JSON.stringify(a) === JSON.stringify(b), "seeds: 同 seed 完全确定性");
  check(a.length >= 240, `seeds: 数量足够 (${a.length})`);

  const cats = new Set(a.map((t) => t.category));
  check(cats.size >= 10, `seeds: 类别 >= 10 (${cats.size})`);
  check(a.some((t) => t.difficultyHint === "hard"), "seeds: 含困难样本");
  check(a.filter((t) => t.category === "plan_request").every((t) => t.profile.llPackage !== undefined), "seeds: 规划任务带约束档案");

  const boundary = a.filter((t) => JSON.stringify(t.profile).match(/"heightCm":(97|112|121|122)\b/));
  check(boundary.length > 0, `seeds: 覆盖身高边界值 (${boundary.length}条)`);

  const deduped = dedup(a);
  check(deduped.length <= a.length && deduped.length > a.length * 0.6, `seeds: 去重合理 (${a.length}→${deduped.length})`);
  check(dedup([a[0], { ...a[0], id: "copy" }]).length === 1, "seeds: 完全重复被去掉");

  // ── 清洗管线：用 ScriptedLLM 造 4 条不同质量的真实轨迹 ──────
  const caller = makeDirectCaller({ mode: "sandbox" });
  const mkTraj = async (script: string[], opts = {}) =>
    runEpisode(new ScriptedLLM(script), { parkId: "shanghai", query: "测试" }, caller, opts);

  // ① 完美轨迹
  const perfect = await mkTraj([
    '<think>查</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
    "<think>好</think><answer>全园平均44分钟。</answer>",
  ]);
  // ② 有纠错的轨迹（borderline：先缺参数后恢复）
  const recovered = await mkTraj([
    '<tool_call>{"name":"get_wait_times","arguments":{}}</tool_call>',
    '<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
    "<answer>全园平均44分钟。</answer>",
  ]);
  // ③ 没有 answer 的坏轨迹
  const noAnswer = await mkTraj(
    Array(3).fill('<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>'),
    { maxTurns: 3 }
  );
  // ④ 长轨迹（难度分级用：12 次调用）
  const long = await mkTraj([
    ...Array(12).fill('<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>'),
    "<answer>信息已足够，给出结论。</answer>",
  ]);

  const toRecord = (t: Awaited<ReturnType<typeof mkTraj>>, id: string, cat: string): TrajectoryRecord => ({
    taskId: id, category: cat, source: "template", difficultyHint: "medium",
    query: "测试", parkId: "shanghai", teacher: "scripted",
    answer: t.answer, stoppedReason: t.stoppedReason,
    toolCallCount: t.toolCallCount, formatErrorCount: t.formatErrorCount,
    answerRepaired: t.answerRepaired, messages: t.messages,
    toolResults: t.steps.map((s) => ({ call: s.parsed.toolCall, ok: s.toolResult?.ok ?? null })),
  });

  const { samples, rejected, stats } = cleanTrajectories([
    toRecord(perfect, "t1", "explicit_wait"),
    toRecord(recovered, "t2", "explicit_wait"),
    toRecord(noAnswer, "t3", "explicit_wait"),
    toRecord(long, "t4", "plan_request"),
  ]);

  check(stats.kept === 3 && stats.rejected === 1, "clean: 3收1弃", stats);
  check(rejected[0]?.taskId === "t3" && ["no_answer", "max_turns_no_answer"].includes(rejected[0]?.reason), "clean: 无答案轨迹被正确拒绝");
  const s1 = samples.find((s) => s.taskId === "t1");
  const s2 = samples.find((s) => s.taskId === "t2");
  const s4 = samples.find((s) => s.taskId === "t4");
  check(s1?.quality === "pass" && s1.weight === 1.0, "clean: 完美轨迹 weight=1.0");
  check(s2?.quality === "borderline" && s2.weight === 0.6, "clean: 纠错轨迹降权保留（宝贵的恢复样本）");
  check(s1?.difficulty === "easy" && s4?.difficulty === "hard", "clean: 难度分级 easy/hard 正确");
  check(s1!.messages.some((m) => m.role === "system") && s1!.messages.at(-1)!.content.includes("<answer>"), "clean: SFT 消息结构完整");

  console.log(failed === 0 ? "\n✅ data smoke 全部通过" : `\n❌ ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})();
