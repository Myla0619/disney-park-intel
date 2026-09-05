/**
 * 评测运行器冒烟测试：ScriptedLLM 模拟被测模型，验证指标计算正确
 * 运行：npm run eval:smoke
 */

import { evaluate, sampleTasks } from "./run_eval";
import { ScriptedLLM } from "../agent/loop";
import { generateSeeds } from "../data/seeds";
import type { SeedTask } from "../data/seeds";

let failed = 0;
function check(cond: boolean, label: string, extra?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else { failed++; console.error(`FAIL ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
}

const mk = (id: string, category: string, query: string, profile: SeedTask["profile"] = {}): SeedTask =>
  ({ id, parkId: "shanghai", category, query, profile, source: "template", difficultyHint: "easy" });

(async () => {
  // 分层抽样
  const seeds = generateSeeds("shanghai");
  const sample = sampleTasks(seeds, 22);
  const cats = new Set(sample.map((t) => t.category));
  check(sample.length <= 22 && cats.size >= 10, `sample: 分层抽样覆盖 ${cats.size} 类 / ${sample.length} 条`);

  // 3 个任务按序脚本化：好轨迹 / 常识直答 / 规划
  const tasks = [
    mk("e1", "explicit_wait", "创极速排多久"),
    mk("e2", "no_tool", "能带吃的进园吗"),
    mk("e3", "plan_request", "带娃规划一天", { mode: "family", kids: [{ age: 5, heightCm: 110 }] }),
  ];
  const llm = new ScriptedLLM([
    // e1
    '<think>测试</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai","ride_id":"tron"}}</tool_call>',
    "<think>测试</think><answer>创极速当前排队约75分钟，建议开园直冲。</answer>",
    // e2
    "<think>测试</think><answer>可以带未开封食品入园，玻璃瓶不行，以当日安检为准。</answer>",
    // e3
    '<think>测试</think><tool_call>{"name":"plan_itinerary","arguments":{"park_id":"shanghai","profile":{"mode":"family","kids":[{"age":5,"heightCm":110}]}}}</tool_call>',
    "<think>测试</think><answer>已规划：09:00 入园先玩小熊维尼，10:00 疯狂动物城，12:00 午餐……</answer>",
  ]);

  const r = await evaluate(llm, tasks, "scripted-smoke", "scripted");
  check(r.metrics.answered === 1, "metrics: answered=1.0", r.metrics);
  check(r.metrics.format_clean === 1, "metrics: format_clean=1.0");
  check(r.metrics.tool_em === 1, "metrics: tool_em=1.0（含 no_tool 正确不调用）");
  check(r.metrics.hallucination === 0, "metrics: hallucination=0");
  check(r.metrics.constraint_pass === 0, "metrics: 自由文本规划答案没有结构化交付证据，不能算通过");
  check(Math.abs(r.metrics.avg_tool_calls - 2 / 3) < 0.01, `metrics: avg_tool_calls≈0.67 (${r.metrics.avg_tool_calls})`);
  check(r.perCategory["plan_request"].n === 1 && r.metrics.reward_mean < 0.7, "metrics: 未验证规划受可行性门控，分类计数保留");
  const failedRun = await evaluate({ async chat() { throw new Error("test transport failure"); } },
    [mk("failure", "plan_request", "规划一天")], "failure-smoke", "scripted");
  check(failedRun.n === 1 && failedRun.perCategory.plan_request.n === 1 && failedRun.metrics.constraint_pass === 0,
    "metrics: 失败规划保留在总数和约束分母中");
  check(failedRun.metrics.format_clean === 0 && failedRun.perSample[0].error === "llm_error",
    "metrics: 无模型输出不算格式成功，保留失败轨迹");

  console.log(failed === 0 ? "\n✅ eval smoke 全部通过" : `\n❌ ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})();
