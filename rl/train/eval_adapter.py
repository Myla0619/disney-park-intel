#!/usr/bin/env python3
"""Evaluate LoRA adapter directly using transformers (no merge, no vllm needed).
Usage: python eval_adapter.py [adapter_path] [out_json_path]
"""
import json, re, sys, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_MODEL = "/root/autodl-tmp/models/qwen32b"
ADAPTER = sys.argv[1] if len(sys.argv) > 1 else "/root/autodl-tmp/outputs/qlora-32b-adapter"
OUT_JSON = sys.argv[2] if len(sys.argv) > 2 else "/root/autodl-tmp/outputs/eval_results.json"
EVAL_SEEDS = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else "/root/autodl-tmp/eval_seeds.jsonl"

SYSTEM_PROMPT = "你是上海迪士尼乐园智能助手。回复格式：<think>思考</think> 然后 <tool_response> 或 <answer>回答</answer>"

# Optional 3rd arg: path to grpo_dataset.jsonl — use its full training system prompt
if len(sys.argv) > 3 and sys.argv[3]:
    _row = json.loads(open(sys.argv[3], encoding="utf-8").readline())
    SYSTEM_PROMPT = _row["prompt"][0]["content"]
    print("Using FULL training system prompt from", sys.argv[3])

EXPECTED_TOOL = {
    "explicit_wait": ["get_wait_times"], "implicit_wait": ["get_wait_times"],
    "review_quality": ["search_reviews"], "review_specific": ["search_reviews"],
    "spot_info": ["get_spot_info", "walk_time"], "weather_dependent": ["get_weather"],
    "plan_request": ["plan_itinerary"],
    "trade_off": ["get_wait_times", "walk_time", "plan_itinerary", "get_spot_info"],
    "edge_name_variant": ["get_wait_times", "search_reviews", "get_spot_info"],
    "edge_negation": ["search_reviews", "get_wait_times"],
    "edge_multi_intent": ["get_wait_times", "search_reviews", "get_spot_info", "walk_time",
                          "plan_itinerary", "get_weather", "get_show_schedule", "get_ll_pricing"],
    "no_tool": [],  # correct = no tool call AND has answer
}

TOOL_RESP_TAG = "<" + "tool_response" + ">"
ANSWER_TAG = "<" + "answer" + ">"

def parse_output(text):
    has_tool = TOOL_RESP_TAG in text
    tool_name = None
    m = re.search(r'"name"\s*:\s*"([^"]+)"', text)
    if m and has_tool:
        tool_name = m.group(1)
    return {"has_tool": has_tool, "tool_name": tool_name, "has_answer": ANSWER_TAG in text,
            "format_ok": (has_tool or ANSWER_TAG in text)}

def main():
    print("Loading model + adapter...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, torch_dtype=torch.float16, device_map="auto", trust_remote_code=True)
    model = PeftModel.from_pretrained(model, ADAPTER)
    model.eval()

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

        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": seed["query"]}]
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(text, return_tensors="pt").to(model.device)

        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=1024, temperature=0.01, do_sample=False)
        response = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        parsed = parse_output(response)

        if parsed["format_ok"]:
            results["format_ok"] += 1; per_cat[cat]["format_ok"] += 1
        if parsed["has_answer"]:
            results["has_answer"] += 1
        expected = EXPECTED_TOOL.get(cat)
        if expected is not None:
            if len(expected) == 0:  # no_tool
                ok = (not parsed["has_tool"]) and parsed["has_answer"]
            else:
                ok = parsed["tool_name"] in expected
            if ok:
                results["tool_correct"] += 1; per_cat[cat]["tool_correct"] += 1

        print(f"  [{results['total']}/{len(seeds)}] {cat} tool={parsed['tool_name']} ok={parsed['format_ok']}")

    print("\n=== RESULTS ===")
    print(f"Total: {results['total']}")
    print(f"Format OK: {results['format_ok']}/{results['total']} ({results['format_ok']/max(results['total'],1):.1%})")
    print(f"Tool Correct: {results['tool_correct']}/{results['total']} ({results['tool_correct']/max(results['total'],1):.1%})")
    print(f"Has Answer: {results['has_answer']}/{results['total']} ({results['has_answer']/max(results['total'],1):.1%})")
    for cat, r in sorted(per_cat.items()):
        print(f"  {cat}: format={r['format_ok']}/{r['total']} tool_em={r['tool_correct']}/{r['total']}")

    out_path = OUT_JSON
    with open(out_path, "w") as f:
        json.dump({"summary": results, "per_category": per_cat}, f, indent=2)
    print(f"\nSaved to {out_path}")

if __name__ == "__main__":
    main()
