# 乐园 Agent：唯一训练主线

主线为 Qwen2.5-32B-Instruct，全参 SFT 冷启动 → 全参、多轮 GRPO。LLaMA-Factory 负责 SFT，veRL 负责 GRPO。`run_all.sh` 是唯一启动入口。旧 adapter 脚本保留作历史参考，直接运行会退出。

## 数据

`data/rl/seeds.jsonl` 是实际生成的 306 个任务家族，覆盖 12 类；先固定家族划分，再扩写。每个种子生成 5 个经教师核查的表达变体，保留原句，去重后目标不少于 1,800 条。最终数量以 `seeds_augmented.jsonl.manifest.json` 为准。扩写查询不等于蒸馏轨迹。

教师扩写、蒸馏均须配置 `TEACHER_BASE_URL`、`TEACHER_MODEL`、`LLM_API_KEY`。多 Key 可用 `LLM_API_KEYS` JSON 数组，仅使用已授权配额。`PARK_SNAPSHOT_AT` 固定回放日期。Key 只留在环境变量或用户指定配置文件，不进仓库。

```bash
bash rl/train/run_all.sh seeds
bash rl/train/run_all.sh augment
bash rl/train/run_all.sh distill
bash rl/train/run_all.sh clean
bash rl/train/run_all.sh prepare-sft
```

扩写使用规则检查、教师语义等价复核、字符 n-gram 去重和断点日志。约束改变会被拒绝；近重复可能导致总量不足，此时命令失败并保留进度，不能把目标量当成实际产量。清洗保留成功恢复的轨迹，输出逐条拒绝原因。只有已完成的 teacher trajectory 才能进入 SFT。

## 全参 SFT

配置为 `sft_full_early.yaml`、`sft_full_mid.yaml`、`sft_full_late.yaml`，均明确 `finetuning_type: full`，使用 BF16 与 ZeRO-3，不加载量化基座和 LoRA。安装 `framework-lock.json` 固定提交的 LLaMA-Factory。

三个阶段使用同一批固定验证家族。前期使用 easy/medium，之后加入 hard。为确保 LLaMA-Factory 实际使用质量权重，预处理将权重转成明确的样本曝光次数：borderline 相对 pass 的曝光为 0.30、0.45、0.60；与学习率、阶段步数共同写入清单。这是采样课程，不宣称原生 Trainer 自动消费 weight 字段。配置的训练步数是起始预算，尚非经过消融确定的最优值。

```bash
bash rl/train/run_all.sh sft-early
bash rl/train/run_all.sh sft-mid
bash rl/train/run_all.sh sft-late
```

阶段产物是完整模型权重，后一阶段从前一阶段权重初始化。训练只监督 assistant 消息，包含完整历史 assistant 动作；工具观察不作为标签目标。GPU 上仍需核对实际 tokenizer 的标签掩码和显存峰值。

## 全参多轮 GRPO

安装 `framework-lock.json` 固定提交的 veRL。环境先运行 `npm run env:serve`，并配置真实 `JUDGE_BASE_URL` / `JUDGE_MODEL` / `LLM_API_KEY`；启发式 Judge 只用于本地联调，不允许进入正式训练。

```bash
bash rl/train/run_all.sh prepare-rl
python rl/train/launch_grpo.py --dry-run
bash rl/train/run_all.sh grpo --phase early
```

`park_agent_loop.py` 使用该 veRL 提交的 AgentLoop 与 Continuous Token 接口，保留生成 token 和 log probability，工具观察对应 response mask 为 0。每次输出交给 `/agent-step`，共享 TypeScript 协议解析与工具执行；完整消息交给 `/reward`。停止条件是答案、调用预算、上下文预算和超时。缺失/截断答案得零分；奖励服务不可用会终止训练，不冒充模型低分。

每题组采样八条完整轨迹。`model.lora_rank: 0`，KL 参考为固定 SFT 权重。`launch_grpo.py --phase mid/late --resume <上一阶段checkpoint>` 保留优化器与 SFT 参考；正式运行时必须核对 pinned veRL 恢复数据迭代器的阶段边界，不能直接把它当成已经完成的课程实验。

答案奖励权重依次为 0.60、0.68、0.75；硬约束不通过或最终行程无证据时总奖励为零。其余过程维度继续记录，便于诊断。

## 评估

`rl/eval/run_eval.ts` 默认只读取冻结的 test 家族；三个 checkpoint 使用同一任务、同一 prompt、同一环境快照。保留逐题完整输出、协议摘要与失败记录。规则分数和 LLM 质量分分别报告。

`rl/eval/cross_judge.ts --left ... --right ... --out ...` 做匿名成对评审，交换 A/B 两次，至少两个独立 Judge；`EVAL_JUDGES` 配置模型、端点和 key 环境变量名，`TRAINING_MODEL_IDS` 列出学生和所有教师模型。位置分歧或跨 Judge 冲突写入 `reviewRequired`，不能靠均值掩盖。

## 当前执行状态

- 306 个种子文件已生成。
- 本地 TypeScript 检查、数据/工具/奖励/评估冒烟、Python 控制流测试已执行；完整记录见 `docs/TRAINING_ALIGNMENT.md`。
- 尚无本次教师扩写/蒸馏产物：当前会话未取得 DeepSeek 配置。
- 尚无本次全参 GPU 训练结果：当前会话未取得 CUDA 机器连接。这里的代码联调不代表八卡训练已成功。
