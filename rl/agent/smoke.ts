/**
 * Agent 协议 + rollout 循环冒烟测试（ScriptedLLM + 沙箱环境，零外部依赖）
 * 运行：npm run agent:smoke
 */

import { parseAgentStep } from "./protocol";
import { buildSystemPrompt } from "./prompt";
import { runEpisode, ScriptedLLM, makeDirectCaller } from "./loop";

let failed = 0;
function check(cond: boolean, label: string, extra?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else {
    failed++;
    console.error(`FAIL ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}

const caller = makeDirectCaller({ mode: "sandbox" });
const P = "shanghai";

(async () => {
  // ── 解析器单测 ───────────────────────────────────────────────
  const good = parseAgentStep('<think>查排队</think>\n<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>');
  check(good.errors.length === 0 && good.toolCall?.name === "get_wait_times", "parse: 标准 tool_call 无错误");

  const badJson = parseAgentStep("<tool_call>{name: get_wait_times}</tool_call>");
  check(badJson.toolCall === null && badJson.errors.some((e) => e.includes("JSON")), "parse: 坏 JSON 报错");

  const unclosed = parseAgentStep("<think>ok</think><answer>今天人不多，建议先玩创极速");
  check(unclosed.answer !== null && unclosed.answerRepaired, "parse: answer 未闭合被补救");

  const both = parseAgentStep('<tool_call>{"name":"walk_time","arguments":{}}</tool_call><answer>x</answer>');
  check(both.answer === null && both.toolCall?.name === "walk_time" && both.errors.length > 0, "parse: tool_call+answer 互斥取 tool_call");

  const neither = parseAgentStep("我觉得今天天气不错");
  check(neither.errors.some((e) => e.includes("也没有")), "parse: 裸文本判格式错误");

  // ── system prompt 生成 ───────────────────────────────────────
  const prompt = buildSystemPrompt(P);
  check(prompt.includes("get_wait_times") && prompt.includes("check_constraints") && prompt.includes("<tool_call>"), "prompt: 包含注册表工具与格式规范");
  check(prompt.length < 3500, "prompt: 保持小模型友好长度(<3500字)", prompt.length);

  // ── episode 1: 正常两步走 ────────────────────────────────────
  const t1 = await runEpisode(
    new ScriptedLLM([
      '<think>查排队</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai","ride_id":"tron"}}</tool_call>',
      '<think>再看评论</think><tool_call>{"name":"search_reviews","arguments":{"park_id":"shanghai","target_id":"tron","target_type":"ride","query":"值得吗"}}</tool_call>',
      "<think>够了</think><answer>创极速当前75分钟，评论认为值得，建议开园直冲。</answer>",
    ]),
    { parkId: P, query: "创极速光轮排多久，值得吗" },
    caller
  );
  check(t1.stoppedReason === "answer" && t1.toolCallCount === 2 && t1.answer!.includes("75"), "episode: 两次工具调用后正常收敛", { reason: t1.stoppedReason, calls: t1.toolCallCount });
  check(t1.messages.filter((m) => m.content.startsWith("<tool_response>")).length === 2, "episode: tool_response 正确注入上下文");
  check(t1.steps[0].toolResult?.ok === true, "episode: 沙箱工具真实执行成功");

  // ── episode 2: 失败感知（坏参数 → 模型纠正）─────────────────
  const t2 = await runEpisode(
    new ScriptedLLM([
      '<tool_call>{"name":"get_wait_times","arguments":{}}</tool_call>', // 缺 park_id
      '<think>补上必填参数</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
      "<answer>当前全园平均等待约44分钟。</answer>",
    ]),
    { parkId: P, query: "现在人多吗" },
    caller
  );
  const firstFeedback = t2.steps[0].toolResult;
  check(firstFeedback?.ok === false && (firstFeedback as any).error.includes("必填参数"), "episode: 缺参数被拦截并回传错误");
  check(t2.stoppedReason === "answer" && t2.toolCallCount === 1, "episode: 模型收到错误后自我纠正");

  // ── episode 3: 格式坏掉 → 错误反馈 → 恢复 ───────────────────
  const t3 = await runEpisode(
    new ScriptedLLM([
      "我直接告诉你答案吧",
      "<think>按格式来</think><answer>请提供更具体的问题。</answer>",
    ]),
    { parkId: P, query: "随便聊聊" },
    caller
  );
  check(t3.stoppedReason === "answer" && t3.formatErrorCount > 0 && (t3.steps[0].toolResult as any)?.error?.includes("格式错误"), "episode: 格式违规回传纠正提示后恢复");

  // ── episode 4: 最大轮数护栏 ─────────────────────────────────
  const loopScript = Array(5).fill('<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>');
  const t4 = await runEpisode(new ScriptedLLM(loopScript), { parkId: P, query: "test" }, caller, { maxTurns: 3 });
  check(t4.stoppedReason === "max_turns" && t4.toolCallCount === 3, "episode: maxTurns 护栏生效");

  // ── episode 5: 工具调用次数上限 ─────────────────────────────
  const t5 = await runEpisode(
    new ScriptedLLM([
      '<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
      '<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
      "<answer>好的，基于已有信息：全园平均44分钟。</answer>",
    ]),
    { parkId: P, query: "test" },
    caller,
    { maxToolCalls: 1 }
  );
  check((t5.steps[1].toolResult as any)?.error?.includes("最大工具调用次数"), "episode: maxToolCalls 上限触发强制收敛提示");

  // ── episode 6: 上下文预算 early-stop ────────────────────────
  const t6 = await runEpisode(
    new ScriptedLLM([
      '<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>',
      "<answer>上下文有限，直接给结论：当前全园平均等待约44分钟。</answer>",
    ]),
    { parkId: P, query: "现在人多吗" },
    caller,
    { maxContextChars: 100 }
  );
  check(t6.earlyStopTriggered && t6.stoppedReason === "answer", "episode: 上下文预算触发 early-stop 提示");

  // ── episode 7: 墙钟超时护栏（防单样本卡死批量蒸馏）──────────
  const t7 = await runEpisode(
    new ScriptedLLM(["<answer>不该到这里。</answer>"]),
    { parkId: P, query: "test" },
    caller,
    { timeoutMs: 0 }
  );
  check(t7.stoppedReason === "timeout" && t7.answer === null, "episode: timeoutMs 墙钟超时生效");

  // ── prompt: 注入当前日期 ────────────────────────────────────
  check(buildSystemPrompt(P).includes(new Date().toISOString().slice(0, 10)), "prompt: 注入当前日期");

  console.log(failed === 0 ? "\n✅ agent smoke 全部通过" : `\n❌ ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})();
