# 训练与部署 / Training and deployment

## 中文

现有实验包括 Qwen 32B 的 QLoRA/SFT 与 GRPO adapter。后续全参方案使用 Qwen2.5-32B-Instruct、LLaMA-Factory 和 veRL，以 `run_all.sh` 为入口。配置存在不代表训练已跑完；旧 adapter 脚本保留作历史参考。

### 数据准备

```bash
bash rl/train/run_all.sh seeds
bash rl/train/run_all.sh augment
bash rl/train/run_all.sh distill
bash rl/train/run_all.sh clean
bash rl/train/run_all.sh prepare-sft
```

教师服务使用 TEACHER_BASE_URL、TEACHER_MODEL、LLM_API_KEY；PARK_SNAPSHOT_AT 固定回放时间。种子按家族划分，扩写数量和拒绝原因写入清单。实际产量以生成文件为准。详见 [数据说明](../data/README.md)。

### 全参训练方案

安装版本以 `framework-lock.json` 为准。SFT 配置为 `sft_full_early.yaml`、`sft_full_mid.yaml`、`sft_full_late.yaml`，使用 BF16 和 ZeRO-3。按 early、mid、late 顺序运行，下一阶段从上一阶段的完整权重初始化。

```bash
bash rl/train/run_all.sh sft-early
bash rl/train/run_all.sh sft-mid
bash rl/train/run_all.sh sft-late
bash rl/train/run_all.sh prepare-rl
python rl/train/launch_grpo.py --dry-run
bash rl/train/run_all.sh grpo --phase early
```

SFT 只监督 assistant 消息，工具返回不作为标签；质量权重通过样本曝光次数实现。GRPO 需要工具环境和独立 Judge，正式训练不能用启发式 Judge 代替。多轮生成保留原始 token 和对数概率，工具返回的训练掩码为零。KL 参考固定为 SFT 权重；恢复阶段前需核对数据迭代器和优化器状态。

这些配置仍需在目标 GPU 上验证标签掩码、显存峰值及恢复行为，不保证在单卡上可运行。流程记录见 [训练对齐记录](../../docs/TRAINING_ALIGNMENT.md)。

### 评测与部署

`rl/eval/run_eval.ts` 使用冻结测试家族，对比模型时固定提示词和环境快照，保存逐题轨迹。`cross_judge.ts` 交换 A/B 顺序并记录评审分歧。首步协议评测见 [EVALUATION.md](EVALUATION.md)，不能替代最终任务成功率。

2026-09-08 核查旧实例：QLoRA/SFT、GRPO adapter 和本地 Qwen 基座文件仍在，实例当时未分配 GPU。尚未验证它们的线上推理。网站接入与备用服务说明见 [部署文档](../../docs/student-deployment.md)。

## English

Existing experiments include Qwen 32B QLoRA/SFT and GRPO adapters. The subsequent full-parameter plan uses Qwen2.5-32B-Instruct, LLaMA-Factory, and veRL through `run_all.sh`. Configuration files do not mean training has completed. Old adapter scripts remain as historical references.

### Data preparation

```bash
bash rl/train/run_all.sh seeds
bash rl/train/run_all.sh augment
bash rl/train/run_all.sh distill
bash rl/train/run_all.sh clean
bash rl/train/run_all.sh prepare-sft
```

Teacher calls use TEACHER_BASE_URL, TEACHER_MODEL, and LLM_API_KEY; PARK_SNAPSHOT_AT fixes replay time. Seeds are split by family; manifests record expansion counts and rejection reasons. Generated files determine actual output. See [data instructions](../data/README.md).

### Full-parameter training plan

Use versions pinned in `framework-lock.json`. SFT configurations are `sft_full_early.yaml`, `sft_full_mid.yaml`, and `sft_full_late.yaml`, using BF16 and ZeRO-3. Run early, mid, and late in order; each stage starts from the previous stage's full weights.

```bash
bash rl/train/run_all.sh sft-early
bash rl/train/run_all.sh sft-mid
bash rl/train/run_all.sh sft-late
bash rl/train/run_all.sh prepare-rl
python rl/train/launch_grpo.py --dry-run
bash rl/train/run_all.sh grpo --phase early
```

SFT supervises assistant messages only; tool observations are not targets. Quality weights are implemented through sample exposure. GRPO requires the tool environment and an independent Judge; formal training cannot substitute the heuristic Judge. Multiturn generation retains original tokens and log probabilities, with tool observations masked out. The KL reference stays fixed at the SFT weights; verify iterator and optimizer state before resuming a stage.

Validate label masks, peak memory, and resumption on the target GPUs. These configurations are not guaranteed to run on one GPU. See [training alignment notes](../../docs/TRAINING_ALIGNMENT.md).

### Evaluation and deployment

`rl/eval/run_eval.ts` uses frozen test families. Keep prompts and environment snapshots fixed across models and retain per-question trajectories. `cross_judge.ts` swaps A/B order and records disagreement. [EVALUATION.md](EVALUATION.md) describes first-step protocol evaluation, which does not replace final task success.

The old instance was checked on 2026-09-08: QLoRA/SFT and GRPO adapter files and the local Qwen base remain present, but no GPU was allocated. Online inference has not been verified. See [deployment instructions](../../docs/student-deployment.md) for website integration and fallback behavior.
