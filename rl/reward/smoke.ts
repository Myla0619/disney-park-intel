/**
 * Reward 冒烟测试（ScriptedLLM + 沙箱 + HeuristicJudge，零外部依赖）
 * 运行：npm run reward:smoke
 */

import { runEpisode, ScriptedLLM, makeDirectCaller } from "../agent/loop";
import { scoreTrajectory, PHASE_WEIGHTS } from "./reward";
import { HeuristicJudge, EnsembleJudge } from "./judge";
import type { SeedTask } from "../data/seeds";

let failed = 0;
function check(cond: boolean, label: string, extra?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else { failed++; console.error(`FAIL ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
}

const caller = makeDirectCaller({ mode: "sandbox" });
const judge = new HeuristicJudge();
const mkTask = (category: string, query: string, profile: SeedTask["profile"] = {}, difficultyHint: SeedTask["difficultyHint"] = "easy"): SeedTask =>
  ({ id: "t", parkId: "shanghai", category, query, profile, source: "template", difficultyHint });

(async () => {
  // 权重健全性
  for (const [phase, w] of Object.entries(PHASE_WEIGHTS)) {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    check(Math.abs(sum - 1) < 1e-9, `weights: ${phase} 权重和为 1`);
  }
  check(PHASE_WEIGHTS.late.answer >= 0.6 && PHASE_WEIGHTS.mid.answer >= 0.6, "weights: mid/late 答案质量 >=60%（大原则）");
  check(PHASE_WEIGHTS.early.answer < PHASE_WEIGHTS.late.answer, "weights: 课程式——答案权重随阶段上升");

  // ① 正确轨迹：查排队→答复含数字
  const good = await runEpisode(new ScriptedLLM([
    '<think>查</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai","ride_id":"tron"}}</tool_call>',
    "<think>答</think><answer>创极速光轮当前排队约75分钟，建议开园直冲或买尊享卡。</answer>",
  ]), { parkId: "shanghai", query: "创极速排多久" }, caller);
  const rGood = await scoreTrajectory(good, mkTask("explicit_wait", "创极速排多久"), judge);
  check(rGood.format === 1 && rGood.trajectory === 1 && rGood.callStatus === 1, "①: 格式/轨迹/状态满分", rGood);
  check(rGood.total > 0.8, `①: 总分高 (${rGood.total.toFixed(2)})`);

  // ② reward-hack 场景：该查排队却直接编答案（格式完美但轨迹 0 分）
  const hack = await runEpisode(new ScriptedLLM([
    "<think>我记得大概</think><answer>创极速光轮现在大约排45分钟，快去吧！</answer>",
  ]), { parkId: "shanghai", query: "创极速排多久" }, caller);
  const rHack = await scoreTrajectory(hack, mkTask("explicit_wait", "创极速排多久"), judge);
  check(rHack.trajectory === 0, "②: 凭空作答轨迹维度 0 分（防编造 hack）");
  check(rHack.total < rGood.total - 0.1, `②: 总分显著低于正确轨迹 (${rHack.total.toFixed(2)} < ${rGood.total.toFixed(2)})`);

  // ③ 常识题不调工具 = 正确
  const noTool = await runEpisode(new ScriptedLLM([
    "<think>测试</think><answer>可以带未开封的食品入园，玻璃瓶和需加热的食物不行，以当日安检为准。</answer>",
  ]), { parkId: "shanghai", query: "能带吃的进园吗" }, caller);
  const rNoTool = await scoreTrajectory(noTool, mkTask("no_tool", "能带吃的进园吗"), judge);
  check(rNoTool.trajectory === 1, "③: 常识题不调工具，轨迹满分");

  // ④ 常识题狂调工具 = 扣分
  const overCall = await runEpisode(new ScriptedLLM([
    '<think>测试</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
    '<think>测试</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
    "<think>测试</think><answer>可以带未开封食品。</answer>",
  ]), { parkId: "shanghai", query: "能带吃的进园吗" }, caller);
  const rOver = await scoreTrajectory(overCall, mkTask("no_tool", "能带吃的进园吗"), judge);
  check(rOver.trajectory < 0.5, "④: 常识题乱调工具被惩罚");
  check(rOver.efficiency < 1, "④: 重复同参调用效率扣分", rOver.detail.efficiency);

  // ⑤ 规划任务：真跑 plan_itinerary，硬约束维度由校验器重算（可验证奖励）
  const plan = await runEpisode(new ScriptedLLM([
    '<think>规划</think><tool_call>{"name":"plan_itinerary","arguments":{"park_id":"shanghai","profile":{"mode":"family","kids":[{"age":5,"heightCm":110}],"watchFireworks":true}}}</tool_call>',
    "<think>测试</think><answer>已为你规划：09:00 入园后先玩小熊维尼（20分钟），10:30 疯狂动物城……21:00 烟花收尾。</answer>",
  ]), { parkId: "shanghai", query: "带娃规划一天" }, caller);
  const rPlan = await scoreTrajectory(plan, mkTask("plan_request", "带娃规划一天", { mode: "family", kids: [{ age: 5, heightCm: 110 }], watchFireworks: true }, "medium"), judge);
  check(rPlan.constraints === 1, "⑤: 规划行程硬约束校验全过（RL/VR）", rPlan.detail.constraints);

  // ⑥ 规划任务不出行程 = 硬约束 0 分
  const planNoTool = await runEpisode(new ScriptedLLM([
    "<think>测试</think><answer>建议你上午玩明日世界，下午看烟花，随便逛逛就行。</answer>",
  ]), { parkId: "shanghai", query: "带娃规划一天" }, caller);
  const rPlanNo = await scoreTrajectory(planNoTool, mkTask("plan_request", "带娃规划一天", {}, "medium"), judge);
  check(rPlanNo.constraints === 0, "⑥: 无可校验行程硬约束 0 分");

  // ⑦ 失败恢复减半惩罚
  const recover = await runEpisode(new ScriptedLLM([
    '<think>测试</think><tool_call>{"name":"get_wait_times","arguments":{}}</tool_call>',
    '<think>测试</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
    "<think>测试</think><answer>全园平均等待约44分钟。</answer>",
  ]), { parkId: "shanghai", query: "人多吗" }, caller);
  const rRec = await scoreTrajectory(recover, mkTask("implicit_wait", "人多吗"), judge);
  check(rRec.callStatus === 0.9, `⑦: 失败后恢复只扣 0.1 (${rRec.callStatus})`);

  // ⑧ Ensemble judge 求平均
  const ens = new EnsembleJudge([judge, judge]);
  const rEns = await scoreTrajectory(good, mkTask("explicit_wait", "创极速排多久"), ens);
  check(Math.abs(rEns.answer - rGood.answer) < 1e-9, "⑧: EnsembleJudge 平均正确");

  // ⑨ 边界：各维度都在 [0,1]
  for (const r of [rGood, rHack, rNoTool, rOver, rPlan, rPlanNo, rRec]) {
    for (const k of ["format", "trajectory", "efficiency", "constraints", "callStatus", "answer", "total"] as const) {
      if (r[k] < 0 || r[k] > 1) { check(false, `⑨: ${k} 越界 (${r[k]})`); }
    }
  }
  check(true, "⑨: 全部维度有界 [0,1]（防无限刷分）");

  // ⑩ 消息序列重建轨迹（veRL 桥接路径）打分一致
  const { rebuildTrajectoryFromMessages } = await import("./rebuild");
  const rebuilt = rebuildTrajectoryFromMessages(good.messages);
  const rRebuilt = await scoreTrajectory(rebuilt, mkTask("explicit_wait", "创极速排多久"), judge);
  check(
    Math.abs(rRebuilt.total - rGood.total) < 1e-9 && rebuilt.toolCallCount === good.toolCallCount,
    `⑩: 重建轨迹与实时轨迹打分一致 (${rRebuilt.total.toFixed(2)})`
  );

  console.log(failed === 0 ? "\n✅ reward smoke 全部通过" : `\n❌ ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})();
