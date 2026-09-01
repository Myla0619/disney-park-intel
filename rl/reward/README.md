# 6 维组合 Reward

```bash
npm run reward:smoke   # 17 项断言（含防 hack 场景），零外部依赖
```

## 维度（5 过程 + 1 结果，每维有界 [0,1]）

| 维度 | 类型 | 说明 |
|---|---|---|
| format | 规则 | 标签闭合、JSON 合法、格式漂移率；answer 补救扣分 |
| trajectory | 规则 | 按任务类别判定该调没调：常识题调工具扣分、该调不调（凭空作答）0 分、多意图要求 ≥2 种工具 |
| efficiency | 规则 | 同名同参重复调用、超出难度预期的冗余调用惩罚 |
| **constraints** | **规则（可验证 RL/VR）** | 从轨迹提取行程，**重跑** `constraints.ts` 校验器（不信任工具自报），身高/时间/LL 间隔无法被话术 hack；规划任务不产出行程 = 0 分 |
| callStatus | 规则 | 失败率惩罚；失败后同工具恢复成功只扣一半（纠错是想要的行为） |
| answer | Judge | 可插拔：`HeuristicJudge`（离线/CI，确定性）→ `LLMJudge`（匹配度/可行性/丰富度/清晰度）→ `EnsembleJudge`（多模型交叉平均，Judge 必须未参与训练与蒸馏） |

## 课程式权重（`PHASE_WEIGHTS`）

early（先学格式和工具）→ mid → late，答案质量权重 0.45 → 0.60 → 0.68；
mid/late 阶段答案 ≥60%（大原则：结构化 reward 不能占主导，否则训练曲线没有上升空间）。

## 防 hack 清单（对应面试题八）

多目标组合（6 维不可能同时 hack）+ 每维有界 + 过程结果兼看（凭空作答被 trajectory 维捉住，
smoke ② 实测：hack 轨迹 0.47 vs 正确轨迹 0.91）+ 硬约束确定性程序校验 + KL 约束在 veRL 训练器配置侧。

## veRL 接入

环境服务的 `POST /reward`：`{trajectory, task, phase?}` → `{ok, result: RewardBreakdown}`。
python 侧 reward 函数收集 rollout 轨迹后 HTTP 调用即可；默认 HeuristicJudge，
设置 `JUDGE_BASE_URL`/`JUDGE_MODEL` 环境变量切 LLM-as-Judge。
