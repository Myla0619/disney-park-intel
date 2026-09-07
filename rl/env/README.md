# 工具环境 / Tool environment

## 中文

独立 HTTP 服务，为训练和产品提供工具表、提示词与工具执行。启动用 `npm run env:serve`，检查用 `npm run env:smoke`。默认监听本机 8100 端口，默认模式为 sandbox。

- `GET /health`：模式、协议和存活状态。
- `GET /tools`：工具名称、说明和参数定义。
- `POST /prompt`：生成训练使用的提示词。
- `POST /call`：执行工具，返回 `{ok:true,result}` 或 `{ok:false,error}`。
- `POST /agent-step`、`POST /reward`：训练步骤执行与奖励计算。

sandbox 使用回放、夹具或合成数据，不应当作实时数据。live 模式请求外部服务，仍需检查返回的降级标记。配置 `PARK_TOOL_API_KEY` 后所有请求都需要 Bearer 鉴权。公开部署步骤见 [部署说明](../../docs/student-deployment.md)。

工具覆盖等待、评论、规划、地点、演出、尊享卡、步行、约束检查和天气。园区映射由 `scripts/parks_config.json` 与应用静态数据共同决定，新增配置不等于完成园区支持。

## English

This standalone HTTP service provides tool definitions, prompts, and execution for training and the product. Start with `npm run env:serve`; check with `npm run env:smoke`. It defaults to localhost port 8100 and sandbox mode.

- `GET /health`: mode, protocol, and service status.
- `GET /tools`: names, descriptions, and argument schemas.
- `POST /prompt`: training prompt generation.
- `POST /call`: tool execution, returning `{ok:true,result}` or `{ok:false,error}`.
- `POST /agent-step`, `POST /reward`: training step execution and reward calculation.

Sandbox uses recorded, fixture, or synthetic data, not live observations. Live mode calls external services; callers must still inspect fallback flags. Setting `PARK_TOOL_API_KEY` requires Bearer authentication on every request. See [deployment instructions](../../docs/student-deployment.md).

Tools cover waits, reviews, planning, locations, shows, Premier Access, walking, constraints, and weather. Park mapping depends on both `scripts/parks_config.json` and application data; adding configuration alone does not complete support for a park.
