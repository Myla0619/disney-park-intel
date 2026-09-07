# 奖励计算 / Reward calculation

## 中文

奖励按格式、工具选择、效率、约束、调用状态和答案质量六个维度记录。规则检查与 Judge 评分分开保留，便于定位失败原因。最终结构化行程需要有工具结果支持，并通过约束校验；格式正确本身不能证明答案正确。

课程阶段权重以 `reward.ts` 中的配置为准。多维评分不能保证模型不会利用奖励漏洞，需结合逐题输出和独立评测检查。启发式 Judge 用于联调；正式训练按训练入口要求配置独立 Judge。

执行 `npm run reward:smoke` 检查评分逻辑。环境服务的 `POST /reward` 接收 `{trajectory, task, phase?}`，返回分项结果。详见 [训练说明](../train/README.md)。

## English

Rewards record six dimensions: format, tool selection, efficiency, constraints, call status, and answer quality. Rule checks and Judge scores are kept separately for diagnosis. Final structured plans need supporting tool results and constraint validation; valid formatting does not prove a correct answer.

Curriculum weights are defined in `reward.ts`. Multiple dimensions do not guarantee resistance to reward exploitation; inspect individual outputs and independent evaluations. The heuristic Judge is for development. Formal training requires the independent Judge configured by the training entry point.

Run `npm run reward:smoke` to check scoring. The environment's `POST /reward` accepts `{trajectory, task, phase?}` and returns component scores. See [training instructions](../train/README.md).
