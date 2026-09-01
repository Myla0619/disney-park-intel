# 迪士尼项目 → Agentic-RL 改造方案

目标：把现在的「调用 Claude API 的工具 Agent」升级为「端到端训练的 Agentic-RL 项目」。
路径与出行规划项目一致：**SFT 冷启动 → 在线 RL（GRPO）**，但用我们自己的园区工具环境和可验证奖励。

---

## 一、现状 vs 目标

| | 现状 | 目标 |
|---|---|---|
| 模型 | Claude API（claude-sonnet-4） | 自己训练的开源小模型（Qwen2.5-7B/14B-Instruct） |
| Agent 能力来源 | prompt 工程 | SFT 冷启动 + GRPO 在线强化学习 |
| 工具 | 4 个，耦合在 Next.js API route 里 | 8+ 个，独立工具环境服务（带重试/超时/沙箱） |
| 数据 | 无训练数据 | 300 种子 → 1500+ 扩增 → 教师蒸馏 rollout → 清洗 |
| 奖励 | 无 | 5 维结构化 reward（含规则可验证约束）+ 1 维答案质量 |
| 评估 | 150 工具用例 + 100 约束场景（评产品） | 同一套评测复用为 base vs SFT vs SFT+RL 三方对比 |

我们项目的独特优势：**迪士尼是封闭世界，约束全部可程序化校验**（身高、时间连续性、LL 90 分钟间隔、离园时间、烟花锚点）。`scripts/eval_itinerary.py` 里的 6 条校验器可以直接改写成 rule-based verifiable reward——这比出行规划项目纯靠 LLM 打分的 reward 更硬。

---

## 二、代码要改什么（按模块）

### 1. 工具环境独立化（新增 `rl/env/`）

现在工具定义在 `src/app/api/agent/tools.ts`，执行逻辑在 `src/app/api/agent/route.ts` 的 `executeTool()`，和 Next.js 耦合。要改成独立的工具环境服务（Python FastAPI，方便接训练框架）：

- **抽出 4 个现有工具**：`get_wait_times` / `search_reviews` / `plan_itinerary` / `get_spot_info`，每个变成一个 HTTP endpoint。
- **扩充到 8+ 工具**（做出"多工具多类型"）：
  - `get_show_schedule`：花车/烟花场次
  - `get_ll_pricing`：11 档优速通价格与含项目列表（数据已在 `src/lib/ll-packages.ts`）
  - `walk_time`：区域间步行时间（已在 `src/lib/parks-data.ts` 的 `walkTime`）
  - `get_weather`：天气接口（下雨影响户外项目/烟花）
  - `check_constraints`：把行程草案交给规则校验器，返回违反项（让模型学会自查）
- **环境稳定性设施**（RL 训练最大隐性成本）：
  - 重试 2–3 次、超时阈值、异常日志作为 tool response 回传给模型
  - 外部 API（themeparks.wiki / Apify / RapidAPI）加 Key 轮询
  - 评论等长返回做截断/摘要，防止撑爆上下文
  - **沙箱模式（record & replay）**：把真实 API 响应录制成缓存，训练 rollout 时全部走缓存——零成本、可复现、不受 QPS 限制。这是迪士尼项目能低成本做 RL 的关键。

### 2. Agent 协议改成开放格式（改 `route.ts` + 新 system prompt）

现在用 Anthropic 私有的 tool_use block。训练开源小模型需要纯文本协议：

- 定义 ReAct 式标签：`<think>` → `<tool_call>{json}</tool_call>` → `<tool_response>` → 循环 → `<answer>`
- 针对 7B/14B 小模型重写 system prompt：**简洁 + 明确示例**，不是越详细越好（大小模型对 prompt 的适配完全不同）
- 调用方护栏：最大工具调用次数（如 30 次）、上下文接近上限时强制 early-stop 总结、`<answer>` 标签未闭合的兜底补救

### 3. 数据管线（新增 `rl/data/`）

- **种子任务（~300 条）**：直接复用现有评测生成器——`eval_tool_accuracy.py` 的 150 条用例模板（11 个类别：显式排队/隐式排队/评论/规划/否定句/多意图/别名…）+ `eval_itinerary.py` 的 100 个约束场景，再补 50 条多约束长程任务（带孩子身高 + 优速通 + 必玩项目 + 时间窗 + 预算）。
- **扩增到 1500+**：LLM 改写（换 persona、换约束组合、换表述风格）。
- **蒸馏**：用教师大模型（Claude / DeepSeek-V3）在工具环境里跑完整多轮 rollout，记录全轨迹（含 think、tool_call、tool_response）。
- **清洗**：
  1. 格式校验（标签闭合、JSON 可解析）
  2. 工具调用成功率过滤
  3. **规则校验器过滤**（复用 6 条约束检查：time_continuity / height_compliance / departure / anchor_integrity / ll_interval / coverage）
  4. LLM 打分分 pass / borderline，borderline 降权（0.5–0.8）不丢弃
- **样本分级**：按工具调用次数打难度标签（1–3 简单 / 4–10 中等 / ≥10 困难），供课程学习使用。

### 4. Reward 设计（新增 `rl/reward/`）

组合式 reward = 5 维结构化 + 1 维答案质量，答案质量占 ≥60%：

| 维度 | 类型 | 来源 |
|---|---|---|
| 格式规范（标签闭合、JSON 合法） | 规则，有界（≤0.3） | 新写 parser |
| 工具轨迹合理性（该调不调/乱调惩罚） | 规则 | 参考 eval_tool_accuracy 的 EM 逻辑 |
| 工具效率（冗余调用惩罚） | 规则 | 调用次数 vs 难度标签 |
| **硬约束校验**（身高/时间/LL间隔/锚点） | **规则，可验证** | **`eval_itinerary.py` 6 条校验器改写** |
| 调用状态（失败感知与恢复） | 规则 | 环境日志 |
| 答案质量（匹配度/可行性/丰富度/清晰度） | LLM-as-Judge | 多模型交叉打分 |

课程式权重：前期结构化权重稍大（先学格式和工具），后期答案质量权重上调。
防 reward hack：多目标组合 + 各子项有界 + 过程结果兼看 + KL 约束。

### 5. 训练（新增 `rl/train/`）

- **SFT 冷启动**：清洗后的蒸馏轨迹，LoRA 或全参微调 Qwen2.5-7B-Instruct（LLaMA-Factory / ms-swift）
- **在线 RL**：veRL + GRPO，工具环境以 HTTP env 形式接入；课程学习（先简单/中等样本，后困难样本）；上下文先 8K 稳步外推
- 硬件按预算：7B LoRA 可 2×4090 起步；全参 + RL 租 4×A100

### 6. 评估（改 `scripts/`）

- `eval_tool_accuracy.py`：改成支持任意 OpenAI-compatible endpoint，跑 base / SFT / SFT+RL 三方对比
- `eval_itinerary.py`：约束通过率作为客观指标
- 新增 LLM-as-Judge 交叉打分（多个未参与训练/蒸馏的模型，A vs B 相对比较优于绝对分）

### 7. 产品侧接回（改 `src/app/api/agent/route.ts`）

- Anthropic client 换成 OpenAI-compatible client（vLLM 部署自己训的模型），模型地址走环境变量
- 保留 Claude 作为 fallback，形成「自训模型主答 + 商业模型兜底」

---

## 三、实施顺序

1. 工具环境服务化 + 沙箱缓存（没有稳定环境，后面全白搭）
2. Agent 文本协议 + 小模型 system prompt 调优
3. 种子 → 扩增 → 蒸馏 → 清洗管线
4. SFT 冷启动，先看格式和工具调用是否稳定
5. Reward 实现（先规则维度，后 LLM 维度）
6. GRPO 在线训练 + 课程学习
7. 三方评估对比，接回产品
