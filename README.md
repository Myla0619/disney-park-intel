# 🏰 Disney Park Intelligence Platform

上海迪士尼行程规划器。Next.js 14 + Claude Tool Use Agent + TSP 贪心路径规划 + BM25 评论检索。

---

## Tech Stack

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| 状态 | Zustand (persisted) |
| LLM | Anthropic Claude（默认 `claude-opus-5`，可用环境变量覆盖） |
| Agent | Anthropic Tool Use API，4 个工具，SSE 流式输出 |
| 检索 | BM25 + 中文字符二元组分词 |
| 等待时间 | themeparks.wiki（实时）+ 自采历史快照加权预测 |
| 评论 | 小红书（经 Apify 离线采集）+ TripAdvisor (RapidAPI) |
| 会话 | 进程内存，可选 Upstash Redis 持久化 |
| 测试 | Vitest（170 条）+ GitHub Actions CI |
| 部署 | Vercel |

---

## 数据与能力边界

这一节写明每项数据从哪来、什么时候会降级，以及降级时如何标注。

| 能力 | 真实来源 | 降级行为 |
|---|---|---|
| 实时等待时间 | themeparks.wiki，20/24 个项目有映射 | 接口不可用时返回内置默认值，响应 `fallback: true` |
| 预测等待时间 | `data/wait-snapshots/` 自采历史快照加权 | 样本 < 8 时退回「当前快照 × 日期系数」，`confidence: low` |
| 评论 | 小红书离线采集语料，14 个游乐项目 × 20 条 = 280 条真实笔记 | 未采集的目标用 `seed-reviews.ts` 人工示例，响应 `fallback: true` |
| 项目评分 | Claude 结构化输出 | 无 API key 或调用失败时用本地规则评分，响应 `fallback: true` |
| AI 助手 | Claude Tool Use，SSE 流式 | 无 API key 时返回 503，前端如实提示 |

**当前语料覆盖**：14 个游乐项目已采集真实小红书笔记（共 280 条）；**餐厅目标尚未采集**
——所用 Apify actor 有 15 次免费运行上限，跑完 14 个目标即耗尽。未采集的目标走人工示例，
接口以 `fallback: true` 标注，Agent 也被提示词要求向用户说明这是示例内容。

**真实语料的两个已知质量问题**（实测，不是推测）：

- **情感标签不可靠**：词典法在真实笔记上约 75% 判为 neutral。小红书正文大量使用话题
  标签、口语与表情符号，很少命中词典里的词。要做准需换成模型分类（采集时批量跑一次即可）
- **rating 是热度代理，不是满意度**：小红书没有星级，该字段由点赞量分档得到。
  280 条语料均值约 4.5，反映的是「抓到的都是热门笔记」，不代表口碑好

园区数据：24 个游乐项目、15 个拍照点、11 家餐厅、11 档尊享卡套餐。

---

## 核心算法

### TSP 贪心路径规划

```
cost = waitWeight × effectiveWait + walkWeight × walkMinutes + energyWeight × thrillScore × 5

路线偏好:
  efficient:  W = [0.7, 0.2, 0.1]  — 少排队，接受多走
  balanced:   W = [0.5, 0.3, 0.2]
  easy:       W = [0.3, 0.5, 0.2]  — 少走路，接受多等
```

等待时间取数优先级：**实测 > 预测 > 项目静态基准**。实测是当下真实排队，预测只是推算，
反过来会让「今天入园」的行程被启发式覆盖掉真实数据。

### 尊享卡折扣

```
无限次套餐 (VIP33)：可用快通项目一律记 5 分钟，且不受 Multi Pass 的 90 分钟间隔约束
套餐 / 单项卡：     effectiveWait = baseWait × 0.15
未购卡：            effectiveWait = baseWait
单项卡时间窗已过：  effectiveWait = baseWait（不打折）
```

资格判定只有一个事实来源：官方尊享卡清单 `LL_ELIGIBLE_RIDES`，`Ride.llEligible` 由它派生。

### 历史等待时间预测

```
predictedWait = (近7日同时段均值 × 0.5
               + 近4周同星期同时段均值 × 0.3
               + 全量同时段基线 × 0.2) × 日期系数

日期系数：法定节假日 1.4 | 周末 1.2 | 工作日 1.0
同时段窗口：±90 分钟；该窗口样本不足时放宽到全天
```

三项成分缺失时按剩余权重**重新归一化**——否则缺一项就等于把预测按比例调低。
样本量低于 8 不做历史预测，直接回退到快照外推，不用两三个点冒充「历史模型」。

快照由 GitHub Actions 每小时采集并提交进仓库（`scripts/collect_wait_snapshots.mjs`），
数据随仓库版本化，clone 下来即可复现预测结果。

### Agent 循环

```
用户消息
  → Claude 选择工具（Tool Use API，adaptive thinking）
  → 本地执行工具（直接函数调用，非自调 HTTP）
  → 结果回灌上下文
  → 继续或作答，最多 5 轮
  → 全程以 SSE 逐段下发：文本增量 + 工具调用进度
```

工具结果带 `isFallbackData` / `isSampleData` 标记，系统提示词要求模型在降级数据上
明确告知用户，而不是把示例数据当作真实排队时间陈述。

### 评论检索

BM25 + 中文字符二元组分词（`适合孩子` → `适合`/`合孩`/`孩子`）。中文没有词间空格，
按空白切词会把整条评论变成一个 token——这是改写前的实际行为，真实评论上所有查询
得分恒为 0。不用神经网络嵌入是为了零额外依赖、零冷启动，代价是匹配不了完全不共词的
同义表达。

---

## 评测

三套评测都可复现，命令与当前结果如下。

### 1. 单元测试

```bash
npm test
```

170 条，覆盖外部 ID 映射、等待时间解析、身高准入、优速通折扣、路径规划约束、
BM25 检索、偏好抽取、会话持久化、限流与入参校验、SSE 分帧。其中 3 条联网检查默认跳过。

### 2. 行程约束评测（100 场景）

```bash
RATE_LIMIT_LLM=100000 npm run dev     # 另开一个终端
python3 scripts/eval_itinerary.py
```

**当前：100/100 通过**（normal 20、time 20、height 20、ll 20、anchor 10、mode 10）

每个场景校验 6 类约束：时间连续性、身高合规（边界取 `>=`）、离园时间、锚点完整性、
Multi Pass 间隔（无限次套餐豁免）、时间覆盖率。评分由脚本按项目属性确定性生成，
不调用 LLM，因此结果可复现且免费。

### 3. 检索质量评测

```bash
npm run eval:retrieval
```

| 指标 | 当前值 |
|---|---|
| P@1 | 0.944 |
| P@3 | 0.556 |
| Recall@3 | 0.678 |
| MRR | 0.963 |
| nDCG@5 | 0.790 |

**局限（重要）**：语料只有 14 条人工编写的示例评论、18 条查询、单人标注、无标注一致性
检验。这组数字只能用于**横向对比检索算法的改动**（比如分词方式改动前后），
**不代表线上真实检索质量**。真实语料的规模与措辞都不同，需要另行标注。
标注集与局限说明见 `scripts/retrieval_eval_set.json`。

### 4. 工具选择准确率（`scripts/eval_tool_accuracy.py`）

脚本已就绪，用 LLM 合成测试用例并评估工具选择准确率（Exact Match / Tool Accuracy /
Parameter Accuracy / No-Tool Precision / Hallucination Rate）。

**尚未运行**——需要 Anthropic API key，且合成 + 评估会产生实际 token 费用。
仓库中没有该项的结果数字，跑过之后再填。

---

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填入 ANTHROPIC_API_KEY
npm run dev
```

不配置 API key 也能运行：项目评分降级为本地规则，AI 助手返回 503 并在前端如实提示。

### 采集真实小红书语料（可选）

```bash
# 在 .env.local 中填入 APIFY_TOKEN（apify.com 注册，有免费额度）
node scripts/collect_reviews.mjs --dry-run          # 先看抓取计划
node scripts/collect_reviews.mjs --target tron      # 单个目标试跑
node scripts/collect_reviews.mjs                    # 全部 34 个目标
```

采集是**离线**的：Apify 按次计费，评论几周才有实质变化，因此不放在请求路径里。
结果提交进 `data/reviews/` 后，线上无需 token 即可提供真实评论。

---

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts           # Agent 编排（SSE 流式）
│   │   ├── agent/tools.ts           # Tool Use 工具定义
│   │   ├── agent/execute-tool.ts    # 工具实现（直接调用服务层）
│   │   ├── itinerary/route.ts       # 路径规划 + Claude 备注润色
│   │   ├── recommend/route.ts       # 项目评分
│   │   ├── reviews/route.ts         # 评论聚合
│   │   ├── rides/route.ts           # 项目清单
│   │   └── waittimes/route.ts       # 实时 / 预测等待时间
│   ├── dashboard/, onboarding/, rides/[id]/, photo/[id]/, restaurant/[id]/, shop/[id]/
├── lib/
│   ├── routing.ts                   # TSP 贪心 + 锚点 + 空档填充 + 手动调序重排
│   ├── provider-ids.ts              # 内部 slug ↔ 两个数据源的 ID 映射
│   ├── wait-times.ts                # 等待时间服务（路由与 Agent 共用）
│   ├── wait-prediction.ts           # 历史快照加权模型
│   ├── snapshot-store.ts            # 快照读取
│   ├── reviews.ts / review-store.ts # 评论服务与已采集语料
│   ├── sources/xiaohongshu.ts       # 小红书抓取客户端
│   ├── vector-store.ts              # BM25 + 中文二元组分词
│   ├── scoring.ts                   # 项目评分（结构化输出）
│   ├── agent-loop.ts                # Tool Use 循环（异步生成器）
│   ├── session-memory.ts / session-store.ts  # 会话与持久化后端
│   ├── height.ts, ll-packages.ts, models.ts, anthropic-client.ts
│   └── api/                         # zod 校验、限流、统一响应
├── data/
│   ├── wait-snapshots/              # 定时采集的排队快照（JSONL）
│   └── reviews/                     # 离线采集的评论语料
└── scripts/                         # 采集脚本与评测
```

---

## 部署注意事项

- **`outputFileTracingIncludes`**：`data/wait-snapshots/` 在运行时用 fs 读取，
  不在 `next.config.js` 里显式声明就不会被打进 Serverless 产物，线上会静默退回快照外推
- **`vercel.json` 的 `ignoreCommand`**：让每小时的数据采集提交不触发重新部署
- **会话持久化**：不配置 Upstash 时会话存在进程内存，Serverless 上每个实例各存一份、
  冷启动即丢失——多轮对话的偏好记忆在生产环境实际不生效。生产部署建议配置 Redis
- **限流**：默认按 IP 固定窗口计数，状态在进程内，多实例下实际阈值会放大。
  挡脚本刷量够用，要严格限流需换共享计数器

---

## License

MIT
