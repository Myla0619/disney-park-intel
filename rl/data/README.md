# 训练数据 / Training data

## 中文

流程为种子生成、查询扩写、教师蒸馏和轨迹清洗。扩写出的查询不能直接算作 SFT 轨迹；只有完成工具循环的教师输出才进入清洗。

```bash
npm run data:seeds
npx tsx rl/data/augment.ts --variants 4
npx tsx rl/data/distill.ts --seeds data/rl/seeds_augmented.jsonl --concurrency 4
npx tsx rl/data/clean.ts
npm run data:smoke
```

扩写和蒸馏需要 TEACHER_BASE_URL、TEACHER_MODEL、LLM_API_KEY。实际数量、变体数和家族划分以生成清单为准。先固定家族划分，避免同一种子的改写分散到训练集与测试集。

种子覆盖排队、评论、规划、地点、无需工具的问题及边界情况。约束包括时间、身高、尊享卡和演出。人工问题有来源记录后才能标为真实语料，采样目标不等于已经取得的数量。

清洗检查答案、格式和工具结果，保留成功纠错的轨迹，记录拒绝原因并划分难度。权重字段是否生效取决于训练器；当前全参方案通过样本曝光次数使用权重。沙箱回放减少外部工具请求，但教师模型调用仍可能收费。

## English

The pipeline generates seeds, expands queries, distils teacher trajectories, and cleans them. Expanded queries are not SFT trajectories; only teacher outputs with completed tool loops enter cleaning.

```bash
npm run data:seeds
npx tsx rl/data/augment.ts --variants 4
npx tsx rl/data/distill.ts --seeds data/rl/seeds_augmented.jsonl --concurrency 4
npx tsx rl/data/clean.ts
npm run data:smoke
```

Expansion and distillation require TEACHER_BASE_URL, TEACHER_MODEL, and LLM_API_KEY. Generated manifests define actual counts, variants, and family splits. Freeze family splits first so variants of a seed do not cross training and test sets.

Seeds cover queues, reviews, planning, locations, no-tool questions, and edge cases. Constraints include time, height, Premier Access, and shows. Human questions need source records before being labelled real data; sampling targets are not collected counts.

Cleaning checks answers, formatting, and tool results, retains successful recovery, records rejection reasons, and assigns difficulty. Weight support depends on the trainer; the current full-parameter plan uses sample exposure counts. Sandbox replay reduces external tool requests, but teacher model calls may still cost money.
