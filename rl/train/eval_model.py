#!/usr/bin/env python3
"""
Evaluate the trained model on the eval set.
Measures: tool selection EM, constraint pass rate, format compliance.
"""
import json
import re
import requests
from pathlib import Path

EVAL_SEEDS = "/root/autodl-tmp/eval_seeds.jsonl"
API_BASE = "http://localhost:8200/v1"
MODEL = "qlora-32b-merged"

SYSTEM_PROMPT = """你是上海迪士尼乐园智能助手。使用以下格式回复：
<think>一句话思考</think>
<tool_call>{"name":"工具名","arguments":{...}}</tool_call>
或
<think>一句话思考</think>
<answer>给游客的最终回答</answer>

可用工具：get_wait_times, search_reviews, plan_itinerary, get_spot_info, get_show_schedule, get_ll_pricing, walk_time, check_constraints, get_weather"""

TOOLS = {
    "get_wait_times": "获取实时等待时间",
    "search_reviews": "搜索评论",
    "plan_itinerary": "规划行程",
    "get_spot_info": "获取项目信息",
    "get_show_schedule": "获取演出时间",
    "get_ll_pricing": "获取尊享卡价格",
    "walk_time": "步行时间",
    "check_constraints": "检查约束",
    "get_weather": "获取天气",
}


def call_llm(messages):
    resp = requests.post(f"{API_BASE}/chat/completions", json={
        "model": MODEL,
        "messages": messages,
        "temperature": 0.0,
        "max_tokens": 2048,
    }, timeout=120)
    return resp.json()["choices"][0]["message"]["content"]


def parse_output(text):
    has_tool = bool(re.search(r"<tool_call>", text))
    has_answer = bool(re.search(r"<answer>", text, re.DOTALL))
    format_ok = (has_tool or has_answer) and "</think>" in text
    tool_name = None
    m = re.search(r'<tool_call>\s*(\{.*?\})\s*, re.DOTALL)
    if m:
        try:
            tool_name = json.loads(m.group(1)).get("name")
        except Exception:
            pass
    return {"has_tool": has_tool, "has_answer": has_answer, "format_ok": format_ok, "tool_name": tool_name}


EXPECTED_TOOL = {
    "explicit_wait": "get_wait_times",
    "implicit_wait": "get_wait_times",
    "review_quality": "search_reviews",
    "review_specific": "search_reviews",
    "spot_info": "get_spot_info",
    "weather_dependent": "get_weather",
    "plan_request": "plan_itinerary",
}


def main():
    seeds = [json.loads(l) for l in open(EVAL_SEEDS) if l.strip()]
    print(f"Evaluating {len(seeds)} samples...")

    results = {"total": 0, "format_ok": 0, "tool_correct": 0, "has_answer": 0}
    per_cat = {}

    for seed in seeds:
        results["total"] += 1
        cat = seed["category"]
        if cat not in per_cat:
            per_cat[cat] = {"total": 0, "format_ok": 0, "tool_correct": 0}
        per_cat[cat]["total"] += 1

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": seed["query"]},
        ]

        try:
            output = call_llm(messages)
            parsed = parse_output(output)

            if parsed["format_ok"]:
                results["format_ok"] += 1
                per_cat[cat]["format_ok"] += 1

            if parsed["has_answer"]:
                results["has_answer"] += 1

            expected = EXPECTED_TOOL.get(cat)
            if expected and parsed["tool_name"] == expected:
                results["tool_correct"] += 1
                per_cat[cat]["tool_correct"] += 1

            status = "OK" if parsed["format_ok"] else "BAD"
            print(f"  [{results['total']}/{len(seeds)}] {cat} {status} tool={parsed['tool_name']}")
        except Exception as e:
            print(f"  [{results['total']}/{len(seeds)}] {cat} ERROR: {e}")

    print("\n=== RESULTS ===")
    print(f"Total: {results['total']}")
    print(f"Format OK: {results['format_ok']}/{results['total']} ({results['format_ok']/results['total']:.1%})")
    print(f"Tool Correct: {results['tool_correct']}/{results['total']} ({results['tool_correct']/results['total']:.1%})")
    print(f"Has Answer: {results['has_answer']}/{results['total']} ({results['has_answer']/results['total']:.1%})")
    print("\nPer category:")
    for cat, r in sorted(per_cat.items()):
        fmt = f"{r['format_ok']}/{r['total']}"
        tool = f"{r['tool_correct']}/{r['total']}"
        print(f"  {cat}: format={fmt} tool_em={tool}")

    out_path = Path("/root/autodl-tmp/outputs/eval_results.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"summary": results, "per_category": per_cat}, indent=2))
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
