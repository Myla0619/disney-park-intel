# 数据管线：种子 → 扩增 → 蒸馏 → 清洗

```bash
npm run data:seeds     # ① 生成种子任务 → data/rl/seeds.jsonl（离线可跑，确定性）
# ② 扩增（需教师端点）：TEACHER_BASE_URL/TEACHER_MODEL/LLM_API_KEY
npx tsx rl/data/augment.ts --variants 4        # → data/rl/seeds_augmented.jsonl
# ③ 蒸馏（需教师端点；断点续跑，已完成任务自动跳过）
npx tsx rl/data/distill.ts --seeds data/rl/seeds_augmented.jsonl --concurrency 4
# ④ 清洗 → SFT 数据
npx tsx rl/data/clean.ts                        # → data/rl/sft/train.jsonl
npm run data:smoke     # 管线冒烟测试（14 项断言，零外部依赖）
```

## Query 多样性四层对策的落地位置

| 层 | 位置 |
|---|---|
| ① 真实人类语料（目标 30–50%） | `data/rl/human_queries.jsonl`，`gen_seeds.ts` 自动合入且去重时优先保留。格式：每行 `{"query":"...","category":"human","profile":{...}}`。来源：小红书攻略帖/评论区提问（Apify 抓取后人工改写） |
| ② persona 池 × 约束采样器 | `seeds.ts`：7 类 persona × 优速通档位 × 时间窗 × 身高（含 97/112/122 边界值）× 烟花/花车/必玩/忌口，确定性 RNG 可复现 |
| ③ 去重 | `seeds.ts` 的 `dedup()`：字符 3-gram Jaccard > 0.8 丢弃（扩增后再跑一遍；embedding 去重后续升级） |
| ④ 人工抽检 | 每批抽 5–10% 看"像不像真人问的"，无代码，流程要求 |

## 种子类别（对齐 eval_tool_accuracy 的 11 类 + 规划难样本）

explicit_wait / implicit_wait / review_quality / review_specific / **plan_request（多约束长程，主力难样本）** /
spot_info / no_tool / edge_negation / edge_multi_intent / weather_dependent / edge_name_variant

## 清洗四道关卡（`clean.ts`）

1. **硬过滤**：无 answer、LLM 报错、格式错误率 100% → 丢弃并记录原因
2. **工具健康度**：全部调用失败 → 丢弃；**部分失败但恢复的保留**（教模型纠错的宝贵样本）
3. **难度分级**：按工具调用次数 easy(≤3)/medium(4–10)/hard(≥10)，输出按 easy→hard 排序，直接支持课程学习
4. **加权**：完美轨迹 weight=1.0，有补救/失败恢复的 borderline 降权 0.6（保多样性不保噪声权重）

输出为 messages 结构的 JSONL，LLaMA-Factory / ms-swift 直接可用（weight 字段供支持样本加权的 trainer 使用）。

## 蒸馏说明

- 教师在**沙箱环境**跑轨迹（record & replay），不打真实 API：可复现、零成本、不受 QPS 限制
- 教师选型：DeepSeek-chat（便宜量大）或 Claude（质量高）做轨迹；两者都**不参与最终 LLM-as-Judge**（防 bias），Judge 用未参与训练与蒸馏的第三方模型
- `--concurrency` 控制并发，断点续跑安全
