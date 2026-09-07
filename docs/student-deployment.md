# 自训模型接入

状态：接入已实现；需要部署真实权重、验证后再启用。SFT/GRPO 尚无合格上线评测，不自动选择 GRPO。

## GPU 实例

使用已合并的完整 checkpoint 启动 `bash rl/train/serve_vllm.sh /absolute/checkpoint 1 8200`。
若只有 LoRA adapter，先找到对应 base model，合并后验证权重；不要把 adapter 目录当完整模型。
vLLM 配置 VLLM_API_KEY，保持本地监听。安装版本需与权重架构兼容。

同一版本仓库运行 `ENV_MODE=live npm run env:serve`，配置 PARK_TOOL_API_KEY。
通过带 TLS 的反向代理分别转发模型 8200 和工具 8100，保留 Authorization 头。
工具服务的 /prompt、/tools、/call 复用训练协议；线上调用明确传 mode=live。
不要直接暴露未鉴权的 GPU 或训练环境端口。

## 网站服务端变量

```dotenv
PARK_AGENT_PROVIDER=student
PARK_MODEL_BASE_URL=https://your-model-host/v1
PARK_MODEL_NAME=park-intel
PARK_MODEL_API_KEY=replace-in-secret-settings
PARK_TOOL_BASE_URL=https://your-tool-host
PARK_TOOL_API_KEY=replace-in-secret-settings
```

变量仅保存在服务端 secret 设置，不使用 NEXT_PUBLIC 前缀，不提交密钥。
student 模式下助手使用自训模型；项目评分使用本地规则，备注使用排程原文，两者不调用 Claude。
自训服务未配置、失败或超时时，若 Anthropic 凭证可用，后台自动切换 Claude 一次。页面不显示模型名称或切换提示。
默认自训整轮预算 20 秒，可用 PARK_STUDENT_TIMEOUT_MS 调整（1–60 秒）。冷启动超过预算会走备用服务。
必须保留网站已有 Anthropic 凭证；两路均不可用时明确报错。回滚可将 PARK_AGENT_PROVIDER 改回 claude。

## 上线验收

1. 用鉴权 GET /v1/models 核对实际加载的 checkpoint 和模型名，记录权重路径、训练运行号。
2. 用鉴权 GET 工具 /health 确认 live 模式与协议版本。
3. 网站询问排队、评论、规划，核对 GPU 请求日志和 SSE tool/done 事件。
4. 故意关闭模型服务，检查 SSE provider 事件确认切换 Claude，页面应正常回答且不显示切换提示；删除备用凭证后应明确报错。
5. 对同一组题跑 SFT 和 GRPO 完整工具循环评测，记录协议正确率与任务成功率，再选上线权重。

公网服务、GPU 存活及权重均未确认前，不将生产变量切为 student。
