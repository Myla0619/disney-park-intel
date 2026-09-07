# Agent 协议与执行循环 / Agent protocol and loop

## 中文

模型每轮输出一个闭合的 `think`，后接唯一的 `tool_call` 或 `answer`。调用参数使用 JSON 对象；工具返回由执行器放入 `tool_response`，作为 user 消息回传。

`protocol.ts` 负责解析和参数校验，`prompt.ts` 从工具表生成提示词，`loop.ts` 驱动蒸馏、采样与评测。默认最多 30 轮、25 次工具调用和 60K 字符上下文；超限会记录停止原因，不代表任务成功。格式错误会回传给模型纠正。旧协议兼容需显式开启，修复后仍计格式错误。

执行 `npm run agent:smoke` 检查协议和循环。返回轨迹包含消息、逐步解析结果、工具结果、错误计数和停止原因。线上自训接入另见 `src/lib/student-agent.ts`，预算与离线评测不同。

## English

Each model turn contains one closed `think` block followed by exactly one `tool_call` or `answer`. Arguments are JSON objects. The executor wraps tool results in `tool_response` and returns them as user messages.

`protocol.ts` parses outputs and validates arguments; `prompt.ts` builds prompts from the registry; `loop.ts` drives distillation, sampling, and evaluation. Defaults are 30 turns, 25 tool calls, and 60K context characters. Hitting a limit records a stop reason, not task success. Format errors are returned for correction. Legacy compatibility is opt-in and still counts as a format violation.

Run `npm run agent:smoke` to check the protocol and loop. Trajectories include messages, parsed steps, tool results, error counts, and stop reasons. Production student integration lives in `src/lib/student-agent.ts` and uses different budgets.
