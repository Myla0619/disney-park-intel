#!/usr/bin/env python3
"""
veRL 自定义 reward：桥接到工具环境服务的 POST /reward。

veRL 侧配置（custom_reward_function）指向本文件的 compute_score。
环境服务需先启动：npm run env:serve（默认 :8100，sandbox 模式）。

约定：rollout 时把任务元信息（task JSON）放进样本的 extra_info 里带过来
（data 预处理时从 data/rl/seeds*.jsonl 原样塞入），本函数把 veRL 收集的
消息序列包装成 Trajectory 结构 POST 给 /reward，返回 total 标量。

注意：/reward 的过程维度需要逐步的 parsed/toolResult 信息，纯消息序列
重建轨迹时由服务端 best-effort 解析；若你的 veRL 版本在 rollout 侧已
保留工具调用结构，优先透传（字段对齐 rl/agent/loop.ts 的 Trajectory）。
"""

import json
import os
import urllib.request

REWARD_URL = os.environ.get("PARK_REWARD_URL", "http://localhost:8100/reward")
PHASE = os.environ.get("PARK_REWARD_PHASE", "mid")  # early / mid / late，随训练阶段调


def _post(payload: dict) -> dict:
    req = urllib.request.Request(
        REWARD_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def compute_score(data_source, solution_str, ground_truth, extra_info=None, **kwargs):
    """veRL custom reward 入口。

    solution_str: 模型完整输出（多轮拼接文本）
    extra_info:   {"task": SeedTask JSON, "messages": [...]}（数据预处理时注入）
    返回 [0,1] 标量 reward。
    """
    extra = extra_info or {}
    task = extra.get("task") or {
        "id": "unknown", "parkId": "shanghai", "category": "human",
        "query": str(ground_truth or ""), "profile": {}, "source": "human",
        "difficultyHint": "medium",
    }
    messages = extra.get("messages")
    if not messages or messages[-1].get("role") != "assistant" or messages[-1].get("content") != solution_str:
        raise ValueError("Provide a trusted complete rollout transcript ending in the current completion; do not score stale prompt messages")

    # 服务端按消息序列 best-effort 重建轨迹（见 server.ts /reward 说明）
    trajectory = extra.get("trajectory") or {
        "messages": messages,
        "steps": [], "answer": None, "answerRepaired": False,
        "stoppedReason": "answer", "toolCallCount": 0,
        "formatErrorCount": 0, "earlyStopTriggered": False,
        "_rebuild_from_messages": True,
    }

    try:
        res = _post({"trajectory": trajectory, "task": task, "phase": PHASE})
        if res.get("ok"):
            return float(res["result"]["total"])
        raise RuntimeError("Reward service rejected trajectory; stop training rather than treating infrastructure failure as model failure")
    except Exception as error:
        raise RuntimeError("Reward service unavailable or invalid result") from error


if __name__ == "__main__":
    # 自测：python rl/train/reward_bridge.py（需 env 服务已启动）
    s = compute_score(
        "park", "<answer>创极速当前约75分钟，建议开园直冲。</answer>", "创极速排多久",
        {"task": {"id": "t", "parkId": "shanghai", "category": "explicit_wait",
                  "query": "创极速排多久", "profile": {}, "source": "template", "difficultyHint": "easy"}},
    )
    print("reward:", s)
