#!/usr/bin/env bash
# 部署训练后的模型（评估 / 接回产品用）
# 7B:  bash rl/train/serve_vllm.sh outputs/sft-7b-merged 1
# 32B: bash rl/train/serve_vllm.sh outputs/grpo-32b-merged 4   (4 卡张量并行)
set -euo pipefail

MODEL_PATH="${1:?用法: serve_vllm.sh <模型路径> [tp并行度=1] [端口=8200]}"
TP="${2:-1}"
PORT="${3:-8200}"

python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL_PATH" \
  --served-model-name park-intel \
  --tensor-parallel-size "$TP" \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.9 \
  --port "$PORT"

# 起来后即为 OpenAI 兼容端点：http://localhost:8200/v1
# 评估侧直接用 rl/agent/loop.ts 的 OpenAICompatLLM 指过来；
# 产品侧 Next.js 把 Anthropic client 换成这个 base_url（Claude 兜底）。
