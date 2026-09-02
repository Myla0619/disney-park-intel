#!/usr/bin/env bash
# GPU 机器一键引导：装环境 → 拉代码 → 跑冒烟测试 → 装 Claude Code（可选，让 Claude 接管）
#
# 用法（在 AutoDL/SeetaCloud 网页终端或 SSH 里粘贴执行）：
#   bash <(curl -fsSL https://raw.githubusercontent.com/Myla0619/disney-park-intel/main/rl/train/bootstrap_gpu.sh)
# 或先 clone 再跑：
#   git clone https://github.com/Myla0619/disney-park-intel && bash disney-park-intel/rl/train/bootstrap_gpu.sh
set -euo pipefail

REPO_URL="https://github.com/Myla0619/disney-park-intel"
WORKDIR="${WORKDIR:-$HOME/disney-park-intel}"

echo "==> [1/5] 系统依赖检查"
command -v git >/dev/null || { echo "缺 git"; exit 1; }
command -v python3 >/dev/null || { echo "缺 python3"; exit 1; }

echo "==> [2/5] Node 20（工具环境服务用）"
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || echo "  Node 自动装失败，手动装 Node20：nvm install 20"
fi
node -v || true

echo "==> [3/5] 拉代码"
if [ -d "$WORKDIR/.git" ]; then
  git -C "$WORKDIR" pull --ff-only || git -C "$WORKDIR" fetch && git -C "$WORKDIR" reset --hard origin/main
else
  git clone "$REPO_URL" "$WORKDIR"
fi
cd "$WORKDIR"
npm install --no-audit --no-fund

echo "==> [4/5] 冒烟测试（确认环境闭环，全绿才继续）"
npm run env:smoke && npm run agent:smoke && npm run data:smoke && npm run reward:smoke && npm run eval:smoke

echo "==> [5/5] Python 训练依赖（按需，耗时较长）"
cat <<'PYDEPS'
接下来手动装训练栈（按你要跑的阶段选）：
  pip install "llamafactory[torch,metrics]"      # SFT
  pip install vllm                               # SFT 后评估/部署
  pip install verl                               # GRPO（版本以官方为准）
  pip install anthropic openai                   # 蒸馏/评估的教师客户端（可选）

然后按 rl/train/README.md 顺序跑：蒸馏 → SFT → 评估 → GRPO。
PYDEPS

echo ""
echo "================ 引导完成 ================"
echo "选项 A（推荐，让 Claude 在这台卡上接管）："
echo "  npm i -g @anthropic-ai/claude-code && claude"
echo "  登录后对它说：按 rl/train/README.md 顺序执行训练，遇到报错自己诊断"
echo ""
echo "选项 B（自己按手册跑）：cat rl/train/README.md"
echo "=========================================="
