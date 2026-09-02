# Agent 协议 + Rollout 循环

训练开源模型用的纯文本工具调用协议（替代 Anthropic 私有 tool_use block），
以及驱动完整 episode 的 rollout 循环。

```bash
npm run agent:smoke   # 16 项断言：解析/补救/护栏/失败感知，零外部依赖
```

## 协议格式

每轮输出二选一：

```
<think>一句话思考</think>
<tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai"}}</tool_call>
```

```
<think>一句话思考</think>
<answer>给游客的最终回答</answer>
```

工具返回以 `<tool_response>{json}</tool_response>` 注入为 user 消息。

## 模块

| 文件 | 职责 |
|---|---|
| `protocol.ts` | 解析 + 校验 + 补救。`errors` 数组同时是 **RL 格式 reward 的判定依据**和**蒸馏数据清洗的格式校验器**（一套解析三处复用） |
| `prompt.ts` | 小模型 system prompt 生成器：从 `/tools` 注册表自动生成工具清单，简洁 + 完整示例（<3500 字），工具增删不用改 prompt |
| `loop.ts` | `runEpisode()`：蒸馏 / RL rollout / 评估共用同一个循环。`OpenAICompatLLM`（vLLM/DeepSeek/通义通吃）、`ScriptedLLM`（测试）、`makeDirectCaller`（同进程沙箱）、`makeHttpCaller`（分布式走 HTTP 环境服务） |

## 调用方护栏（面试题三"调用方"部分的实现）

- **maxToolCalls**（默认 25）：超限后回传"请立即输出 answer"强制收敛
- **maxTurns**（默认 30）：防死循环兜底
- **maxContextChars**（默认 60K 字符）：接近预算时在 tool_response 后附加强制总结提示（early-stop）
- **失败感知**：坏 JSON、缺必填参数、未知工具、格式违规——全部作为
  `{ok:false,error}` 回传，模型读错误自我纠正（smoke 里有完整的纠正用例）
- **answer 未闭合补救**：只有 `<answer>` 没有闭合标签时截取剩余内容并标记 `answerRepaired`

## Trajectory 输出

`runEpisode` 返回完整轨迹：messages（可直接转 SFT 样本）、每步解析结果与工具返回、
`toolCallCount`（样本难度分级依据）、`formatErrorCount`（格式 reward / 清洗过滤依据）、
`stoppedReason`、`earlyStopTriggered`。蒸馏、RL、评估三条链路吃同一份结构。
