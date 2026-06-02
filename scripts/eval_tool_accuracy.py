#!/usr/bin/env python3
"""
Disney Agent Tool Use Accuracy Evaluator
=========================================
Generates 150 test cases via LLM synthesis and evaluates tool selection accuracy.

Usage:
    python scripts/eval_tool_accuracy.py --generate   # generate test cases
    python scripts/eval_tool_accuracy.py --eval        # run evaluation
    python scripts/eval_tool_accuracy.py --all         # generate + eval
    python scripts/eval_tool_accuracy.py --report      # print last report

Requirements:
    pip install anthropic rich
    export ANTHROPIC_API_KEY=sk-ant-...
"""

import os, json, argparse, time, re
from pathlib import Path
from typing import Optional
import anthropic

# ─── Tool definitions (mirrors src/app/api/agent/tools.ts) ───────────────────
DISNEY_TOOLS = [
    {
        "name": "get_wait_times",
        "description": "获取上海迪士尼乐园项目的实时或历史预测等待时间。当用户询问排队、等待时间、哪个项目人少时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "rideId": {"type": "string", "description": "项目ID，可选"},
                "mode":   {"type": "string", "enum": ["live","historical"]}
            },
            "required": ["mode"]
        }
    },
    {
        "name": "search_reviews",
        "description": "搜索特定项目或餐厅的用户评论，使用RAG语义检索。当用户询问某个项目好不好玩、值不值得时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "targetId":   {"type": "string"},
                "targetType": {"type": "string", "enum": ["ride","restaurant"]},
                "query":      {"type": "string"},
                "topK":       {"type": "number"}
            },
            "required": ["targetId","targetType","query"]
        }
    },
    {
        "name": "plan_itinerary",
        "description": "根据用户偏好和当前状态生成或重新规划今日行程。当用户要求规划行程、重新安排时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "currentArea":    {"type": "string"},
                "remainingHours": {"type": "number"},
                "avoidRides":     {"type": "array", "items": {"type": "string"}},
                "mustRides":      {"type": "array", "items": {"type": "string"}},
                "maxWaitMinutes": {"type": "number"}
            },
            "required": []
        }
    },
    {
        "name": "get_spot_info",
        "description": "获取拍照点、购物店、餐厅的详细信息和导航建议。当用户询问某个地点怎么去、在哪里时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "spotId":      {"type": "string"},
                "spotType":    {"type": "string", "enum": ["photo","shop","restaurant","ride"]},
                "currentArea": {"type": "string"}
            },
            "required": ["spotId","spotType"]
        }
    }
]

SYSTEM_PROMPT = """你是上海迪士尼乐园的专属AI助手。你有以下工具可以调用：
- get_wait_times：查询实时或预测等待时间
- search_reviews：语义搜索项目/餐厅评论
- plan_itinerary：规划或重新规划行程
- get_spot_info：获取拍照点/餐厅/商店/项目详情

上海迪士尼主要项目ID：
tron(创极速光轮), soaring(飞越地平线), zootopia-ride(热力追踪), 
seven-dwarfs(七个小矮人矿山车), pirates(加勒比海盗), roaring-rapids(雷鸣山漂流),
frozen(冰雪奇缘), dragon(抱抱龙), winnie(小熊维尼), buzz-lightyear(巴斯光年),
peter-pan(小飞侠), crystal-grotto(晶彩奇航), slinky-dash(胡迪牛仔嘉年华)

园区区域ID：entrance, mickey, garden, fantasy, adventure, treasure, tomorrow, toytown, zootopia

回答规则：优先调用工具获取最新数据，不要凭记忆猜测等待时间。"""

# ─── Test case categories and examples ───────────────────────────────────────
CATEGORIES = {
    "explicit_wait": {
        "desc": "明确查询等待时间",
        "examples": ["TRON现在要排多久", "创极速光轮等待时间"],
        "expected_tool": "get_wait_times",
        "count": 20
    },
    "implicit_wait": {
        "desc": "间接询问人流/拥挤度",
        "examples": ["现在哪个项目最不用排队", "哪里人少"],
        "expected_tool": "get_wait_times",
        "count": 15
    },
    "review_quality": {
        "desc": "询问项目好不好/值不值得",
        "examples": ["飞越地平线好不好玩", "加勒比海盗值得排吗"],
        "expected_tool": "search_reviews",
        "count": 20
    },
    "review_specific": {
        "desc": "询问特定维度评价",
        "examples": ["飞越地平线适合5岁孩子吗", "港湾餐厅好吃吗"],
        "expected_tool": "search_reviews",
        "count": 15
    },
    "plan_request": {
        "desc": "请求规划或重新规划行程",
        "examples": ["帮我规划下午的行程", "我现在在宝藏湾，接下来怎么安排"],
        "expected_tool": "plan_itinerary",
        "count": 20
    },
    "spot_info": {
        "desc": "询问具体地点信息",
        "examples": ["贝儿餐厅怎么预约", "TRON入口在哪里拍照"],
        "expected_tool": "get_spot_info",
        "count": 15
    },
    "no_tool_needed": {
        "desc": "不需要工具的一般问题",
        "examples": ["迪士尼几点开门", "今天天气怎么样", "谢谢你"],
        "expected_tool": "none",
        "count": 15
    },
    "edge_ambiguous": {
        "desc": "边缘：模糊意图",
        "examples": ["那个很火的项目怎么样", "好玩吗"],
        "expected_tool": "search_reviews",  # best guess
        "count": 10
    },
    "edge_negation": {
        "desc": "边缘：否定句",
        "examples": ["我不想知道排队时间，就问好不好玩", "别告诉我人多不多，就说值不值得玩"],
        "expected_tool": "search_reviews",
        "count": 8
    },
    "edge_multi_intent": {
        "desc": "边缘：多意图混合",
        "examples": ["飞越地平线好玩吗，现在要排多久", "TRON值得买尊享卡吗，排队要多久"],
        "expected_tool": "get_wait_times",  # first intent
        "count": 8
    },
    "edge_name_variant": {
        "desc": "边缘：项目名称变体/别名",
        "examples": ["那个趴着坐的过山车排多久", "光轮现在人多吗", "摩托车项目怎么样"],
        "expected_tool": "get_wait_times",
        "count": 4
    },
}

# Total: 20+15+20+15+20+15+15+10+8+8+4 = 150


# ─── Generate test cases ──────────────────────────────────────────────────────
def generate_test_cases(client: anthropic.Anthropic, output_path: str):
    """Generate 150 test cases using Claude."""
    all_cases = []

    for cat_id, cat in CATEGORIES.items():
        count = cat["count"]
        print(f"  Generating {count} cases for: {cat['desc']}...")

        prompt = f"""生成{count}个测试用例，用于测试迪士尼AI助手的工具调用准确性。

类别：{cat['desc']}
期望工具：{cat['expected_tool']}
示例：{json.dumps(cat['examples'], ensure_ascii=False)}

要求：
1. user_input 必须是中文口语化表达，多样化，不要重复
2. 每个用例的 expected_tool 固定为 "{cat['expected_tool']}"
3. expected_params 只包含最关键的1-2个参数（用于验证）
4. difficulty: easy(意图明确)/medium(需要推断)/hard(含歧义或复杂上下文)
5. 覆盖不同说法、不同场景、不同语气

可用项目ID：tron, soaring, zootopia-ride, seven-dwarfs, pirates, roaring-rapids, 
frozen, dragon, winnie, buzz-lightyear, peter-pan, crystal-grotto, slinky-dash

返回格式（严格JSON数组，无其他文字）：
[
  {{
    "id": "{cat_id}_001",
    "category": "{cat_id}",
    "user_input": "用户说的话",
    "expected_tool": "{cat['expected_tool']}",
    "expected_params": {{"key": "value"}},
    "difficulty": "easy|medium|hard",
    "note": "为什么期望这个工具"
  }}
]"""

        try:
            resp = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = resp.content[0].text.strip()
            # Strip markdown code blocks if present
            raw = re.sub(r"```json\s*|\s*```", "", raw).strip()
            cases = json.loads(raw)
            all_cases.extend(cases)
            print(f"    ✓ Generated {len(cases)} cases")
            time.sleep(0.5)  # Rate limiting
        except Exception as e:
            print(f"    ✗ Error: {e}")

    # Save to file
    Path(output_path).write_text(
        json.dumps(all_cases, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"\n✓ Saved {len(all_cases)} test cases to {output_path}")
    return all_cases


# ─── Parameter checker ────────────────────────────────────────────────────────
def check_params(actual: dict, expected: dict) -> tuple[bool, list[str]]:
    """
    Check if actual params match expected (partial match).
    Returns (is_correct, list_of_mismatches)
    """
    mismatches = []
    for key, val in expected.items():
        if key not in actual:
            mismatches.append(f"missing key '{key}'")
        elif actual[key] != val:
            # For rideId/targetId: allow partial match (alias handling)
            if key in ("rideId", "targetId") and isinstance(val, str):
                # Accept if actual contains expected or vice versa
                if val not in str(actual[key]) and str(actual[key]) not in val:
                    mismatches.append(f"'{key}': expected={val}, actual={actual.get(key)}")
            else:
                mismatches.append(f"'{key}': expected={val}, actual={actual.get(key)}")
    return len(mismatches) == 0, mismatches


# ─── Evaluate single case ─────────────────────────────────────────────────────
def evaluate_case(client: anthropic.Anthropic, case: dict) -> dict:
    """Run one test case and return evaluation result."""
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            tools=DISNEY_TOOLS,
            messages=[{"role": "user", "content": case["user_input"]}]
        )

        tool_calls = [b for b in resp.content if b.type == "tool_use"]

        # No tool called
        if not tool_calls:
            correct = case["expected_tool"] == "none"
            return {
                "case_id":        case["id"],
                "category":       case["category"],
                "difficulty":     case["difficulty"],
                "user_input":     case["user_input"],
                "correct":        correct,
                "tool_correct":   correct,
                "param_correct":  correct,
                "actual_tool":    "none",
                "expected_tool":  case["expected_tool"],
                "actual_params":  {},
                "mismatches":     [] if correct else ["no tool called but expected " + case["expected_tool"]],
                "error":          None,
            }

        actual_tool   = tool_calls[0].name
        actual_params = dict(tool_calls[0].input) if tool_calls[0].input else {}

        tool_ok  = actual_tool == case["expected_tool"]
        param_ok, mismatches = check_params(actual_params, case.get("expected_params", {})) if tool_ok else (False, ["wrong tool"])

        return {
            "case_id":       case["id"],
            "category":      case["category"],
            "difficulty":    case["difficulty"],
            "user_input":    case["user_input"],
            "correct":       tool_ok and param_ok,
            "tool_correct":  tool_ok,
            "param_correct": param_ok if tool_ok else False,
            "actual_tool":   actual_tool,
            "expected_tool": case["expected_tool"],
            "actual_params": actual_params,
            "mismatches":    mismatches,
            "error":         None,
        }

    except Exception as e:
        return {
            "case_id":      case["id"],
            "category":     case["category"],
            "difficulty":   case["difficulty"],
            "user_input":   case["user_input"],
            "correct":      False,
            "tool_correct": False,
            "param_correct":False,
            "actual_tool":  "error",
            "expected_tool":case["expected_tool"],
            "actual_params":{},
            "mismatches":   [],
            "error":        str(e),
        }


# ─── Run full evaluation ──────────────────────────────────────────────────────
def run_evaluation(client: anthropic.Anthropic, cases_path: str, results_path: str):
    """Evaluate all test cases and save results."""
    cases = json.loads(Path(cases_path).read_text(encoding="utf-8"))
    print(f"Evaluating {len(cases)} test cases...")

    results = []
    for i, case in enumerate(cases):
        if i % 10 == 0:
            print(f"  Progress: {i}/{len(cases)}")
        result = evaluate_case(client, case)
        results.append(result)
        time.sleep(0.3)  # Rate limiting

    Path(results_path).write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"✓ Saved results to {results_path}")
    return results


# ─── Analysis & Report ────────────────────────────────────────────────────────
def analyze_results(results: list) -> dict:
    total = len(results)
    if total == 0:
        return {}

    correct       = sum(r["correct"]       for r in results)
    tool_correct  = sum(r["tool_correct"]  for r in results)
    param_correct = sum(r.get("param_correct", False) for r in results)
    errors        = sum(1 for r in results if r.get("error"))

    # By difficulty
    by_diff = {}
    for diff in ["easy", "medium", "hard"]:
        subset = [r for r in results if r.get("difficulty") == diff]
        if subset:
            by_diff[diff] = {
                "total":       len(subset),
                "exact_match": sum(r["correct"] for r in subset) / len(subset),
                "tool_acc":    sum(r["tool_correct"] for r in subset) / len(subset),
            }

    # By category
    by_cat = {}
    for r in results:
        cat = r.get("category", "unknown")
        if cat not in by_cat:
            by_cat[cat] = {"total": 0, "correct": 0}
        by_cat[cat]["total"]   += 1
        by_cat[cat]["correct"] += r["correct"]
    for cat in by_cat:
        by_cat[cat]["accuracy"] = by_cat[cat]["correct"] / by_cat[cat]["total"]

    # Confusion matrix
    confusion = {}
    for r in results:
        if not r["tool_correct"]:
            pair = f"{r['expected_tool']} → {r['actual_tool']}"
            confusion[pair] = confusion.get(pair, 0) + 1

    # No-tool precision
    no_tool_cases = [r for r in results if r["expected_tool"] == "none"]
    no_tool_prec  = (sum(r["correct"] for r in no_tool_cases) / len(no_tool_cases)
                     if no_tool_cases else None)

    # Hallucination rate (called tool when none expected)
    hallucinations = sum(
        1 for r in results
        if r["expected_tool"] == "none" and r["actual_tool"] not in ("none", "error")
    )

    # Worst performing inputs
    failures = [r for r in results if not r["correct"]]
    failures.sort(key=lambda r: r.get("difficulty", "easy"))

    return {
        "total":              total,
        "exact_match":        correct / total,
        "tool_accuracy":      tool_correct / total,
        "param_accuracy":     param_correct / max(tool_correct, 1),
        "no_tool_precision":  no_tool_prec,
        "hallucination_rate": hallucinations / max(len(no_tool_cases), 1),
        "error_count":        errors,
        "by_difficulty":      by_diff,
        "by_category":        by_cat,
        "top_confusions":     sorted(confusion.items(), key=lambda x: -x[1])[:10],
        "failure_examples":   [
            {"input": r["user_input"], "expected": r["expected_tool"],
             "actual": r["actual_tool"], "diff": r.get("difficulty")}
            for r in failures[:15]
        ],
    }


def print_report(analysis: dict):
    """Pretty-print evaluation report."""
    print("\n" + "="*60)
    print("  DISNEY AGENT TOOL USE ACCURACY REPORT")
    print("="*60)
    print(f"\n  Total Cases:        {analysis['total']}")
    print(f"  Exact Match:        {analysis['exact_match']:.1%}")
    print(f"  Tool Accuracy:      {analysis['tool_accuracy']:.1%}")
    print(f"  Param Accuracy:     {analysis['param_accuracy']:.1%}")
    if analysis['no_tool_precision'] is not None:
        print(f"  No-Tool Precision:  {analysis['no_tool_precision']:.1%}")
    print(f"  Hallucination Rate: {analysis['hallucination_rate']:.1%}")
    if analysis['error_count']:
        print(f"  API Errors:         {analysis['error_count']}")

    print("\n─── By Difficulty ───────────────────────────────────────")
    for diff, stats in analysis["by_difficulty"].items():
        print(f"  {diff:8s}  EM={stats['exact_match']:.1%}  Tool={stats['tool_acc']:.1%}  (n={stats['total']})")

    print("\n─── By Category ─────────────────────────────────────────")
    for cat, stats in sorted(analysis["by_category"].items(), key=lambda x: x[1]["accuracy"]):
        bar = "█" * int(stats["accuracy"] * 20)
        print(f"  {cat:25s}  {stats['accuracy']:.1%}  {bar}  (n={stats['total']})")

    print("\n─── Top Confusion Pairs ─────────────────────────────────")
    for pair, count in analysis["top_confusions"][:5]:
        print(f"  {pair:45s}  {count}x")

    print("\n─── Failure Examples ────────────────────────────────────")
    for ex in analysis["failure_examples"][:10]:
        print(f"  [{ex['diff']:6s}] \"{ex['input'][:45]}\"")
        print(f"           expected={ex['expected']:20s} actual={ex['actual']}")

    print("\n" + "="*60)

    # Pass/fail verdict
    em = analysis["exact_match"]
    ta = analysis["tool_accuracy"]
    if em >= 0.75 and ta >= 0.85:
        print("  ✅ PASS: Meets target benchmarks (EM>=75%, Tool>=85%)")
    elif em >= 0.65 and ta >= 0.75:
        print("  ⚠️  PARTIAL: Below target, consider prompt tuning")
    else:
        print("  ❌ FAIL: Significant improvement needed")
    print("="*60 + "\n")


# ─── CLI ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Disney Agent Tool Use Evaluator")
    parser.add_argument("--generate", action="store_true", help="Generate test cases")
    parser.add_argument("--eval",     action="store_true", help="Run evaluation")
    parser.add_argument("--all",      action="store_true", help="Generate + evaluate")
    parser.add_argument("--report",   action="store_true", help="Print last report")
    parser.add_argument("--cases",    default="scripts/test_cases.json")
    parser.add_argument("--results",  default="scripts/eval_results.json")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.report:
        print("Error: ANTHROPIC_API_KEY not set")
        return

    client = anthropic.Anthropic(api_key=api_key) if api_key else None

    if args.all or args.generate:
        print("Generating test cases...")
        generate_test_cases(client, args.cases)

    if args.all or args.eval:
        if not Path(args.cases).exists():
            print(f"Error: {args.cases} not found. Run --generate first.")
            return
        results = run_evaluation(client, args.cases, args.results)
        analysis = analyze_results(results)
        print_report(analysis)
        # Save analysis
        Path(args.results.replace(".json", "_analysis.json")).write_text(
            json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    if args.report:
        results_path = Path(args.results)
        if not results_path.exists():
            print(f"No results found at {args.results}. Run --eval first.")
            return
        results  = json.loads(results_path.read_text(encoding="utf-8"))
        analysis = analyze_results(results)
        print_report(analysis)


if __name__ == "__main__":
    main()
