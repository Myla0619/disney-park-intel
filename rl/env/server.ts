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
      if (!parsed.tool || typeof parsed.tool !== "string") {
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
  json(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[env] tool environment listening on :${PORT} (default mode: ${DEFAULT_MODE})`);
});
