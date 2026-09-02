#!/usr/bin/env python3
"""
单卡 A800 80G：TRL GRPOTrainer + QLoRA，从 SFT adapter 继续训。

Reward 是 rl/reward/reward.ts 六维组合的 Python 单轮移植版：
  format / trajectory / efficiency / constraints / callStatus / answer
单轮适配说明：GRPO rollout 只采样模型的第一步输出（think + tool_call 或 answer），
不执行工具，因此：
  - constraints：plan_request 类只看是否正确发起 plan_itinerary（无法重跑硬约束校验）
  - callStatus：无执行，恒为中性 1
  - answer：no_tool 类用参考回答做字符 bigram 重合度打分；
            工具类任务若跳过工具直接作答 = 编造，answer 记 0（与 trajectory 维度一致惩罚）
权重用课程 early 阶段（reward.ts PHASE_WEIGHTS）。
"""
import json
import re
import time
from collections import defaultdict
from pathlib import Path

import torch
from datasets import Dataset
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import GRPOConfig, GRPOTrainer

BASE = "/root/autodl-tmp/models/qwen32b"
SFT_ADAPTER = "/root/autodl-tmp/outputs/qlora-32b-adapter"
DATA = "/root/autodl-tmp/disney-park-intel/data/rl/grpo/grpo_dataset.jsonl"
OUTPUT_DIR = "/root/autodl-tmp/outputs/grpo-32b"
FINAL_ADAPTER = "/root/autodl-tmp/outputs/grpo-32b-adapter"
REWARD_LOG = Path("/root/autodl-tmp/outputs/grpo_reward_log.jsonl")

# ── reward.ts 移植 ────────────────────────────────────────────────────────────

PHASE_WEIGHTS = {"format": 0.15, "trajectory": 0.12, "efficiency": 0.08,
                 "constraints": 0.12, "callStatus": 0.08, "answer": 0.45}  # early

EXPECTED_TOOLS = {
    "explicit_wait": ["get_wait_times"],
    "implicit_wait": ["get_wait_times"],
    "review_quality": ["search_reviews"],
    "review_specific": ["search_reviews"],
    "plan_request": ["plan_itinerary"],
    "spot_info": ["get_spot_info", "walk_time"],
    "weather_dependent": ["get_weather"],
    "edge_negation": ["search_reviews", "get_wait_times"],
    "edge_name_variant": ["get_wait_times", "search_reviews", "get_spot_info"],
    "edge_multi_intent": [],   # 要求发起工具调用（单轮无法验证 >=2 种）
    "trade_off": [],           # 同上
    "no_tool": [],             # 要求 0 次调用
    "human": [],
}

REQUIRED_ARGS = {
    "get_wait_times": ["park_id"],
    "search_reviews": ["park_id", "target_id", "target_type", "query"],
    "plan_itinerary": ["park_id"],
    "get_spot_info": ["park_id", "spot_id", "spot_type"],
    "get_show_schedule": ["park_id"],
    "get_ll_pricing": [],
    "walk_time": ["park_id", "from_area", "to_area"],
    "check_constraints": ["park_id", "itinerary"],
    "get_weather": ["park_id"],
}

THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)
TOOL_RE = re.compile(r"<tool_response>\s*(.*?)\s*</tool_response>", re.DOTALL)
ANSWER_RE = re.compile(r"<answer>(.*?)</answer>", re.DOTALL)

clamp01 = lambda x: max(0.0, min(1.0, x))
_dim_acc = defaultdict(float)
_dim_n = 0
_last_flush = time.time()


def parse_completion(text: str):
    think = THINK_RE.search(text)
    tool_m = TOOL_RE.search(text)
    ans_m = ANSWER_RE.search(text)
    call, call_ok = None, False
    if tool_m:
        try:
            obj = json.loads(tool_m.group(1))
            if isinstance(obj, dict) and obj.get("name"):
                call, call_ok = obj, True
        except json.JSONDecodeError:
            pass
    return {"think": think is not None, "tool_raw": tool_m is not None,
            "call": call, "call_ok": call_ok,
            "answer": ans_m.group(1).strip() if ans_m else None}


def bigram_overlap(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    ga = {a[i:i + 2] for i in range(len(a) - 1)}
    gb = {b[i:i + 2] for i in range(len(b) - 1)}
    return len(ga & gb) / max(1, len(ga | gb))


def score_one(text, category, ref_answer, ref_tool_name):
    p = parse_completion(text)

    # 1. format
    fmt = 1.0
    if not p["think"]:
        fmt -= 0.3
    if p["tool_raw"] and not p["call_ok"]:
        fmt -= 0.4
    if p["call_ok"] and p["answer"] is not None:
        fmt -= 0.3
    if not p["tool_raw"] and p["answer"] is None:
        fmt -= 0.4
    fmt = clamp01(fmt)

    # 2. trajectory
    if category == "no_tool":
        traj = 1.0 if not p["call_ok"] else clamp01(1 - 0.4)
    elif category in ("edge_multi_intent", "trade_off"):
        traj = 1.0 if p["call_ok"] else 0.0
    else:
        expected = EXPECTED_TOOLS.get(category, [])
        if not expected:
            traj = 0.7
        elif p["call_ok"]:
            name = p["call"]["name"]
            traj = 1.0 if name in expected else 0.3
        else:
            traj = 0.0  # 该调工具却直接作答/格式坏 = 疑似编造

    # 3. efficiency（单轮：参数合法性）
    if p["call_ok"]:
        name = p["call"]["name"]
        args = p["call"].get("arguments") or {}
        if name not in REQUIRED_ARGS:
            eff = 0.2
        else:
            need = REQUIRED_ARGS[name]
            missing = [k for k in need if k not in args]
            eff = 1.0 if not missing else (0.5 if len(missing) == 1 else 0.2)
            if args.get("park_id") not in (None, "shanghai"):
                eff = min(eff, 0.5)
    elif p["answer"] is not None:
        eff = 1.0 if category == "no_tool" else 0.5
    else:
        eff = 0.2

    # 4. constraints（单轮近似：plan_request 必须正确发起 plan_itinerary）
    if category == "plan_request":
        cons = 1.0 if (p["call_ok"] and p["call"]["name"] == "plan_itinerary") else 0.0
    else:
        cons = 1.0

    # 5. callStatus：无执行，中性
    call_status = 1.0

    # 6. answer
    if category == "no_tool":
        ans = clamp01(2.5 * bigram_overlap(p["answer"] or "", ref_answer)) if p["answer"] else 0.0
    else:
        ans = 1.0 if p["call_ok"] else 0.0  # 跳过工具直接作答 = 编造，0 分

    total = clamp01(sum(PHASE_WEIGHTS[k] * v for k, v in
                        [("format", fmt), ("trajectory", traj), ("efficiency", eff),
                         ("constraints", cons), ("callStatus", call_status), ("answer", ans)]))

    global _dim_n, _last_flush
    for k, v in [("format", fmt), ("trajectory", traj), ("efficiency", eff),
                 ("constraints", cons), ("callStatus", call_status), ("answer", ans), ("total", total)]:
        _dim_acc[k] += v
    _dim_n += 1
    if time.time() - _last_flush > 120 and _dim_n:
        REWARD_LOG.parent.mkdir(parents=True, exist_ok=True)
        with REWARD_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": round(time.time()), "n": _dim_n,
                                **{k: round(v / _dim_n, 3) for k, v in _dim_acc.items()}},
                               ensure_ascii=False) + "\n")
        _dim_acc.clear(); _dim_n = 0; _last_flush = time.time()
    return total


def composite_reward(completions, category=None, ref_answer=None, ref_tool_name=None, **kwargs):
    texts = []
    for c in completions:
        if isinstance(c, list):  # conversational: [{"role":"assistant","content":...}]
            texts.append(c[-1].get("content", "") if c else "")
        else:
            texts.append(str(c))
    cats = category or [""] * len(texts)
    refs = ref_answer or [""] * len(texts)
    rtns = ref_tool_name or [""] * len(texts)
    return [score_one(t, c, r, n) for t, c, r, n in zip(texts, cats, refs, rtns)]


# ── 训练 ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[{time.strftime('%H:%M:%S')}] loading dataset...")
    rows = [json.loads(l) for l in Path(DATA).read_text(encoding="utf-8").splitlines() if l.strip()]
    for r in rows:
        r.pop("id", None)
        r.pop("query", None)
    ds = Dataset.from_list(rows)
    print(f"{len(ds)} prompts, columns={ds.column_names}")

    print("loading tokenizer + base(4bit) + SFT adapter...")
    tok = AutoTokenizer.from_pretrained(SFT_ADAPTER)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                             bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
    base = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb,
                                                dtype=torch.bfloat16, device_map="auto")
    base.config.use_cache = False
    model = PeftModel.from_pretrained(base, SFT_ADAPTER, is_trainable=True)
    model.print_trainable_parameters()

    cfg = GRPOConfig(
        output_dir=OUTPUT_DIR,
        num_train_epochs=1,
        per_device_train_batch_size=6,
        gradient_accumulation_steps=2,
        num_generations=6,
        max_completion_length=768,
        learning_rate=2e-5,
        lr_scheduler_type="cosine",
        warmup_steps=10,
        beta=0.02,
        temperature=1.0,
        top_p=0.95,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=2,
        save_steps=40,
        save_total_limit=2,
        report_to="none",
        optim="adamw_torch",
        seed=42,
        shuffle_dataset=True,
        use_vllm=False,
    )

    trainer = GRPOTrainer(model=model, reward_funcs=composite_reward, args=cfg,
                          train_dataset=ds, processing_class=tok)
    print(f"[{time.strftime('%H:%M:%S')}] start GRPO training...")
    trainer.train()
    trainer.save_model(FINAL_ADAPTER)
    tok.save_pretrained(FINAL_ADAPTER)
    print(f"GRPO_DONE adapter saved -> {FINAL_ADAPTER}")


if __name__ == "__main__":
    main()
