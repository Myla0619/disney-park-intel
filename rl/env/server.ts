/**
 * 工具环境 HTTP 服务（RL 训练环境的对外接口）
 *
 * 端点：
 *   GET  /health          存活检查
 *   GET  /tools           工具注册表（name/description/input_schema）
 *   POST /call            {tool, args, mode?, snapshot_at?} → ToolResult 信封
 *
 * 设计约定：
 *   - 工具失败一律 HTTP 200 + {ok:false,error}——错误是喂给模型的信号，不是服务器故障
 *   - HTTP 4xx/5xx 只表示"调用方协议错误"（JSON 坏了、缺 tool 字段）
 *   - 默认 sandbox 模式；ENV_MODE=live 或请求级 mode:"live" 切实调
 *
 * 启动：npm run env:serve   （PORT 默认 8100）
 */

import { createServer } from "node:http";
import { TOOL_REGISTRY, callTool, type ToolContext } from "./tools";
import type { EnvMode } from "./util";
import { scoreTrajectory, type CurriculumPhase } from "../reward/reward";
import { HeuristicJudge, LLMJudge, type Judge } from "../reward/judge";
import { rebuildTrajectoryFromMessages } from "../reward/rebuild";

// 默认启发式 Judge；配置 JUDGE_BASE_URL/JUDGE_MODEL 后切 LLM-as-Judge
const judge: Judge =
  process.env.JUDGE_BASE_URL && process.env.JUDGE_MODEL
    ? new LLMJudge(process.env.JUDGE_BASE_URL, process.env.JUDGE_MODEL)
    : new HeuristicJudge();

const PORT = Number(process.env.PORT ?? 8100);
const DEFAULT_MODE = (process.env.ENV_MODE as EnvMode) ?? "sandbox";
const MAX_BODY = 1024 * 1024;

function json(res: any, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(s);
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: "ok", mode: DEFAULT_MODE, tools: TOOL_REGISTRY.length });
  }
  if (req.method === "GET" && req.url === "/tools") {
    return json(res, 200, { tools: TOOL_REGISTRY });
  }
  if (req.method === "POST" && req.url === "/call") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: "请求体不是合法 JSON" });
      }
      if (!parsed || typeof parsed !== "object" || !parsed.tool || typeof parsed.tool !== "string") {
        return json(res, 400, { ok: false, error: "缺少 tool 字段" });
      }
      const ctx: ToolContext = {
        mode: (parsed.mode as EnvMode) ?? DEFAULT_MODE,
        snapshotAt: parsed.snapshot_at,
      };
      const result = await callTool(parsed.tool, parsed.args, ctx);
      return json(res, 200, result);
    });
    return;
  }
  // 奖励打分：veRL 的 python reward 函数 POST {trajectory, task, phase?} 到这里
  if (req.method === "POST" && req.url === "/reward") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * MAX_BODY) req.destroy(); // 轨迹较大，放宽到 8MB
    });
    req.on("end", async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: "请求体不是合法 JSON" });
      }
      if (!parsed || typeof parsed !== "object" || !parsed.trajectory || !parsed.task) {
        return json(res, 400, { ok: false, error: "缺少 trajectory / task 字段" });
      }
      try {
        // veRL 桥接：只有 messages 时（或显式要求）从消息序列重建轨迹
        let trajectory = parsed.trajectory;
        if (trajectory._rebuild_from_messages || !trajectory.steps?.length) {
          trajectory = rebuildTrajectoryFromMessages(trajectory.messages ?? []);
        }
        const breakdown = await scoreTrajectory(
          trajectory, parsed.task, judge, (parsed.phase as CurriculumPhase) ?? "mid"
        );
        return json(res, 200, { ok: true, result: breakdown });
      } catch (e: any) {
        return json(res, 200, { ok: false, error: `reward 计算失败: ${e?.message}` });
      }
    });
    return;
  }
  json(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, process.env.ENV_HOST ?? "127.0.0.1", () => {
  console.log(`[env] tool environment listening on :${PORT} (default mode: ${DEFAULT_MODE})`);
});
