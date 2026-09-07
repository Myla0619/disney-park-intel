# 历史评测 / Historical evaluations

## 中文

此目录的旧 JSON 结果早于统一的 `first-step-tool-call-v1` 评测协议，缺少完整逐题原始输出、冻结提示词和测试集哈希，以及准确的权重来源。保留用于追溯，不作为新实验的可比成绩。

旧 adapter 评测和 GRPO 奖励曾把 `tool_response` 当成模型调用，而运行时要求 `tool_call`；旧端点评测还存在 Python 语法错误。修复代码不会修复已经训练的权重，也不会让旧指标自动有效。

新成对评测参见 [评测说明](../../../rl/train/EVALUATION.md)。首步工具正确率与完整工具执行、最终任务成功率要分别报告。

## English

Older JSON results here predate the unified `first-step-tool-call-v1` evaluator. They lack complete raw outputs per question, frozen prompt and test hashes, and exact checkpoint provenance. Keep them for historical reference, not as comparable new results.

The old adapter evaluator and GRPO reward treated `tool_response` as a model call, while runtime expects `tool_call`. The old endpoint evaluator also had a Python syntax error. Fixing code does not repair trained weights or validate old metrics retroactively.

See [evaluation instructions](../../../rl/train/EVALUATION.md) for new paired runs. Report first-step tool accuracy separately from end-to-end tool execution and final task success.
