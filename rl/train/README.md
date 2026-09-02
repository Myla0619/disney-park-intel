# 训练手册：从租卡到出数字

## 文件

| 文件 | 用途 |
|---|---|
| `convert_sft.py` | clean.ts 输出 → LLaMA-Factory sharegpt 格式（支持课程学习分阶段导出） |
| `sft_7b_lora.yaml` | 阶段一：7B 链路验证 SFT（1×A100 / 2×4090） |
| `sft_32b_lora.yaml` | 阶段二：Qwen3-32B 正式 SFT（4×A100 80G，ZeRO-3） |
| `grpo_verl.yaml` | veRL GRPO 配置模板（8×A100/H800；标 [CHECK] 的字段装好 veRL 后核对） |
| `tool_config.yaml` | veRL 多轮 rollout → 工具环境 /call 的桥接模板 |
| `reward_bridge.py` | veRL custom reward → POST /reward（PARK_REWARD_PHASE 控课程阶段） |
| `serve_vllm.sh` | 训练后模型部署成 OpenAI 兼容端点（评估/产品接回用） |

## 要什么卡（租卡指南）

| 阶段 | 卡 | 时长预估 | 干什么 |
|---|---|---|---|
| ① 蒸馏 | **不用卡** | 0.5–1 天 | 教师 API（DeepSeek ~10-30 元）跑 1500 条轨迹 |
| ② 7B 链路验证 | **1×A100 80G**（或 2×4090） | 1–2 天 | SFT（~1-2h）+ GRPO 小规模试跑 + 评估，把整条链路调通 |
| ③ 32B SFT | **4×A100 80G** | 0.5 天 | LoRA + ZeRO-3，几小时 |
| ④ 32B GRPO | **8×A100 80G / 8×H800** | 2–4 天 | rollout(sglang) + 训练，含调参 |
| ⑤ 评估 | ②/③ 的机器复用 | 0.5 天 | base / SFT / SFT+RL 三方跑分 |

**租卡建议**：AutoDL / 阿里云 PAI / 智星云按小时租。**先只租 ②的 1×A100**（几十块/天）把链路跑通，
7B 数字到手再租 8 卡冲 32B——8 卡机在链路没验证前开着就是烧钱。
机器要求：CUDA 12.x、能装 `llamafactory`、`verl`、`vllm`/`sglang`、Node 20+（跑工具环境服务）。

## 多久出数字

- **最快出第一批可写数字（7B）：累计 3–4 天**
  蒸馏 1 天 → SFT + 评估 1 天 → GRPO 试跑 + 复评 1–2 天。
  产出：7B 的 base vs SFT vs SFT+RL 三方对比（工具选择 EM、约束通过率、Judge 分）。
- **32B 完整数字：再加 4–6 天**（SFT 0.5 天 + GRPO 2–4 天 + 评估 0.5 天 + 调试 buffer）。
- 全程日历时间约 **1.5–2 周**（含等卡、踩坑 buffer；纯计算时间远小于此）。

## 跑批顺序（每步都有验证点）

```bash
# 0. 机器上装好后，先跑四套冒烟测试确认环境
npm install && npm run env:smoke && npm run agent:smoke && npm run data:smoke && npm run reward:smoke

# 1. 蒸馏（不用 GPU，任何机器都行）
npm run data:seeds
TEACHER_BASE_URL=https://api.deepseek.com/v1 TEACHER_MODEL=deepseek-chat LLM_API_KEY=sk-... \
  npx tsx rl/data/augment.ts --variants 4
TEACHER_BASE_URL=... TEACHER_MODEL=... LLM_API_KEY=... \
  npx tsx rl/data/distill.ts --seeds data/rl/seeds_augmented.jsonl --concurrency 4
npx tsx rl/data/clean.ts        # 看 stats：kept/rejected 比例，rejected 过高先查教师质量

# 2. SFT（课程学习两轮）
python rl/train/convert_sft.py --difficulty easy medium
python rl/train/convert_sft.py
llamafactory-cli train rl/train/sft_7b_lora.yaml
llamafactory-cli export ...     # LoRA merge → outputs/sft-7b-merged

# 3. SFT 后立即评估（不要闷头进 RL）：格式遵循率、工具选择 EM 先达标
bash rl/train/serve_vllm.sh outputs/sft-7b-merged 1
# 用 rl/agent/loop.ts 的 OpenAICompatLLM 指向 :8200 跑评测集

# 4. GRPO
npm run env:serve &             # 工具环境 + reward（sandbox）
PARK_REWARD_PHASE=early python -m verl.trainer.main_ppo --config-path rl/train --config-name grpo_verl
# 盯三条曲线：reward 均值上升 / KL 不爆 / 格式错误率下降

# 5. 三方评估 → 拿数字 → 填进简历版本 B
```

## 踩坑预警（对应面试题）

- SFT 后格式还漂移 → 先怀疑 system prompt 与模板（题六），不要急着调 RL 超参
- reward 曲线高但不涨 → 结构化权重占比过大（题七），检查 PARK_REWARD_PHASE
- rollout 极慢 → 确认走的是 sandbox（零外部调用）；上下文先 8K，稳步外推（题十三）
- loss 突刺 / KL 爆炸 → 降 lr、升 kl_loss_coef；确认课程学习没有直接上 hard 样本
