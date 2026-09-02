# 工具环境服务（RL Environment）

RL 训练的地基：把产品里耦合在 Next.js API 的工具抽成独立 HTTP 服务，
带沙箱回放、双源互备、失败感知、多乐园支持。

## 启动与测试

```bash
npm run env:serve    # 启动服务，默认 :8100，默认 sandbox 模式
npm run env:smoke    # 冒烟测试（15 项断言，零外部依赖，CI 可跑）
```

## 端点

| 端点 | 说明 |
|---|---|
| `GET /health` | 存活检查 |
| `GET /tools` | 工具注册表（name/description/input_schema），SFT/RL 的 system prompt 从这里生成 |
| `POST /call` | `{tool, args, mode?, snapshot_at?}` → `{ok:true,result}` 或 `{ok:false,error}` |

约定：**工具失败一律 HTTP 200 + `{ok:false,error}`**——错误是喂给模型的信号（失败感知，
让模型学会纠正参数/换策略），不是服务器故障。4xx 只表示协议错误（JSON 坏了等）。

## 9 个工具

`get_wait_times` `search_reviews` `plan_itinerary` `get_spot_info` `get_show_schedule`
`get_ll_pricing` `walk_time` `check_constraints` `get_weather`

其中 `check_constraints` 是模型的行程自查器，其内核（`constraints.ts`）同时是
RL reward 的硬约束校验维度和数据清洗过滤器——一套规则三处复用。

## 模式

- **sandbox（默认）**：排队/演出走录制回放（`data/waittimes/` → 无数据时用
  `fixtures/waittimes.sample.jsonl` 合成样例兜底）；评论走本地语料（餐厅评论是仓库真实
  数据，项目评论暂用合成夹具，等 Apify 管线替换）；天气按日期哈希确定性伪造。
  **零外部依赖、零成本、完全可复现**——RL rollout 全部用这个模式。
  `snapshot_at`（ISO 时间）可回放指定时刻的拥挤度。
- **live**：排队实调 themeparks.wiki，失败自动切 queue-times（重试 2 次 + 15s 超时 +
  双源互备）。线上产品和终验时用。

## 稳定性设施（对应面试题三）

重试（withRetry）、超时（withTimeout）、异常回传（错误信封）、上下文压缩
（truncateStrings 深度截断超长字符串）、双源互备、沙箱回放。

## 多乐园

乐园由 `scripts/parks_config.json` 驱动（`app_id` 对应 `src/lib/parks-data.ts` 的园区
静态数据，`id` 对应录制数据目录）。新增乐园 = 加一条配置 + 补静态数据。
注意：parks-data 里 queueTimesId=21 与 parks_config 里 30 不一致，接 live 前用
`https://queue-times.com/parks.json` 核对一次。

## 与训练框架对接（veRL）

rollout worker 在每次工具调用时 POST /call（sandbox 模式），把返回 JSON 作为
`<tool_response>` 拼进上下文。环境无状态、可水平扩展，一台机器起 N 个实例即可
支撑并行 rollout。

## 确定性打分器

`scorer.ts`：环境内不调商业大模型（贵 + 不可复现），用确定性规则给项目打分。
同输入永远同输出，reward 不被外部模型随机性污染。
