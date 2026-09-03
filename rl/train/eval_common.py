"""Auditable FIRST-STEP evaluation. Does not execute tools or score final task success."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

VERSION = "first-step-tool-call-v1"
EXPECTED = {
    "explicit_wait": ["get_wait_times"], "implicit_wait": ["get_wait_times"],
    "review_quality": ["search_reviews"], "review_specific": ["search_reviews"],
    "spot_info": ["get_spot_info", "walk_time"], "weather_dependent": ["get_weather"],
    "plan_request": ["plan_itinerary"], "no_tool": [],
    "trade_off": ["get_wait_times", "walk_time", "plan_itinerary", "get_spot_info"],
    "edge_name_variant": ["get_wait_times", "search_reviews", "get_spot_info"],
    "edge_negation": ["search_reviews", "get_wait_times"],
    "edge_multi_intent": ["get_wait_times", "search_reviews", "get_spot_info", "walk_time",
                          "plan_itinerary", "get_weather", "get_show_schedule", "get_ll_pricing"],
}
REQUIRED = {
    "get_wait_times": ["park_id"],
    "search_reviews": ["park_id", "target_id", "target_type", "query"],
    "plan_itinerary": ["park_id"],
    "get_spot_info": ["park_id", "spot_id", "spot_type"],
    "get_show_schedule": ["park_id"], "get_ll_pricing": [],
    "walk_time": ["park_id", "from_area", "to_area"],
    "check_constraints": ["park_id", "itinerary"], "get_weather": ["park_id"],
}


def parse_output(text):
    result = dict(format_ok=False, tool_name=None, arguments=None, arguments_present=False,
                  has_answer=False, error=None)
    match = re.fullmatch(r"\s*<think>.*?</think>\s*(?:<tool_call>(.*?)</tool_call>|<answer>(.*?)</answer>)\s*",
                         text, re.S)
    if not match or text.count("<think>") != 1 or text.count("<tool_call>") + text.count("<answer>") != 1 or "<tool_response>" in text:
        result["error"] = "Expected one think followed by one tool_call or answer"
        return result
    if match.group(2) is not None:
        result.update(format_ok=bool(match.group(2).strip()), has_answer=bool(match.group(2).strip()))
        return result
    try:
        call = json.loads(match.group(1))
        if not isinstance(call, dict) or not isinstance(call.get("name"), str) or not isinstance(call.get("arguments"), dict):
            raise ValueError("Tool call requires name:string and arguments:object")
        name, args = call["name"], call["arguments"]
        result.update(format_ok=True, tool_name=name, arguments=args,
                      arguments_present=name in REQUIRED and all(k in args for k in REQUIRED[name]))
    except (ValueError, TypeError) as error:
        result["error"] = str(error)
    return result


def expected_tools(seed):
    if "expected_tools" in seed:
        tools = seed["expected_tools"]
        if not isinstance(tools, list) or not all(isinstance(t, str) for t in tools):
            raise ValueError("expected_tools must be a list of tool names")
        return tools
    return EXPECTED.get(seed.get("category"))


def score(seed, text):
    parsed = parse_output(text)
    expected = expected_tools(seed)
    correct = None if expected is None else bool(parsed["format_ok"] and (
        parsed["tool_name"] in expected if expected else parsed["has_answer"] and parsed["tool_name"] is None))
    return dict(parsed, expected_tools=expected, tool_correct=correct)


def parser(description):
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--eval-set", required=True)
    ap.add_argument("--prompt", required=True, help="Frozen full system prompt; same file for both models")
    ap.add_argument("--out", required=True)
    ap.add_argument("--checkpoint-id", required=True, help="Immutable checkpoint revision/hash, not an alias")
    ap.add_argument("--base-id", required=True, help="Base model revision/hash")
    ap.add_argument("--max-tokens", type=int, default=1024)
    return ap


def load_inputs(args):
    if Path(args.out).exists():
        raise FileExistsError("Choose a new output path; existing results are never overwritten")
    prompt = Path(args.prompt).read_text(encoding="utf8")
    raw = Path(args.eval_set).read_bytes()
    seeds = [json.loads(line) for line in raw.decode("utf8").splitlines() if line.strip()]
    if not seeds or not prompt.strip() or args.max_tokens <= 0:
        raise ValueError("Nonempty eval set/prompt and positive max-tokens required")
    if "<tool_call>" not in prompt or "search_reviews" not in prompt:
        raise ValueError("Use the frozen full tool_call system prompt, not the old abbreviated prompt")
    for row in seeds:
        if not isinstance(row, dict) or not isinstance(row.get("query"), str) or not row["query"].strip():
            raise ValueError("Each eval row needs a nonempty query")
        expected_tools(row)
    return prompt, seeds, hashlib.sha256(raw).hexdigest()


def run(args, generate, backend, inputs=None):
    prompt, seeds, eval_hash = inputs or load_inputs(args)
    try:
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = None
    metadata = dict(version=VERSION, backend=backend, checkpoint_id=args.checkpoint_id,
                    base_id=args.base_id, prompt=prompt,
                    prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(), eval_sha256=eval_hash,
                    decoding=dict(temperature=0, max_tokens=args.max_tokens), git_revision=revision,
                    evaluator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                    started_at=datetime.now(timezone.utc).isoformat(),
                    scope="first step only; no tool execution; argument values and final success not evaluated")
    rows = []
    for index, seed in enumerate(seeds):
        row = dict(index=index, seed=seed, raw_output="", request_error=None)
        try:
            row["raw_output"] = generate([{"role": "system", "content": prompt}, {"role": "user", "content": seed["query"]}])
        except Exception as error:
            # Do not persist exception bodies: HTTP responses can contain credentials.
            row["request_error"] = type(error).__name__
        row.update(score(seed, row["raw_output"]))
        rows.append(row)
        print(f"{index + 1}/{len(seeds)} tool={row['tool_name']} correct={row['tool_correct']} error={row['request_error']}")
    summary = dict(total=len(rows), scored=sum(r["tool_correct"] is not None for r in rows),
                   tool_correct=sum(r["tool_correct"] is True for r in rows),
                   format_ok=sum(r["format_ok"] for r in rows),
                   arguments_present=sum(r["arguments_present"] for r in rows),
                   has_answer=sum(r["has_answer"] for r in rows),
                   request_errors=sum(r["request_error"] is not None for r in rows))
    out = Path(args.out)
    if out.exists():
        raise FileExistsError(f"Refusing to overwrite {out}; choose a new result path")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dict(metadata=metadata, summary=summary, per_sample=rows), ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps(summary))


def compare(left, right):
    keys = ("version", "backend", "base_id", "prompt_sha256", "eval_sha256", "decoding", "evaluator_sha256")
    for key in keys:
        if key not in left.get("metadata", {}) or left["metadata"].get(key) != right.get("metadata", {}).get(key):
            raise ValueError(f"Not comparable: metadata mismatch/missing {key}")
    a, b = left["per_sample"], right["per_sample"]
    if len(a) != len(b) or any(x["seed"] != y["seed"] for x, y in zip(a, b)):
        raise ValueError("Not comparable: different sample order/content")
    if any(r.get("request_error") for r in a + b):
        raise ValueError("Request errors present; rerun before comparing models")
    return dict(left=left["summary"], right=right["summary"],
                improved=[x["index"] for x, y in zip(a, b) if x["tool_correct"] is False and y["tool_correct"] is True],
                regressed=[x["index"] for x, y in zip(a, b) if x["tool_correct"] is True and y["tool_correct"] is False])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("left")
    ap.add_argument("right")
    args = ap.parse_args()
    print(json.dumps(compare(json.loads(Path(args.left).read_text()), json.loads(Path(args.right).read_text())), indent=2))
