#!/usr/bin/env python3
"""
单卡 A800 80G：TRL GRPOTrainer + QLoRA，从 SFT adapter 继续训。

reward_v2.py 只评估首步协议/工具/参考参数，不执行工具，不声称任务成功。
默认 30 步小试验；必须完成 rl/PROTOCOL.md 门禁并使用新输出目录。
"""
if __name__ == "__main__":
    raise SystemExit("Historical adapter entrypoint retired. Use rl/train/run_all.sh for the full-parameter pipeline.")

import json
import os
import shutil
import time
from pathlib import Path

import torch
from datasets import Dataset
from peft import PeftModel, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
from trl import GRPOConfig, GRPOTrainer
from reward_v2 import score_first_step
from preflight import audit

BASE = "/root/autodl-tmp/models/qwen32b"
SFT_ADAPTER = "/root/autodl-tmp/outputs/qlora-32b-adapter"
DATA = "/root/autodl-tmp/disney-park-intel/data/rl/grpo/grpo_dataset.jsonl"
OUTPUT_DIR = "/root/autodl-tmp/outputs/grpo-32b"
FINAL_ADAPTER = "/root/autodl-tmp/outputs/grpo-32b-adapter"

def composite_reward(completions, category=None, ref_answer=None, ref_tool_name=None, ref_tool_args=None, **kwargs):
    texts = []
    for c in completions:
        if isinstance(c, list):  # conversational: [{"role":"assistant","content":...}]
            texts.append(c[-1].get("content", "") if c else "")
        else:
            texts.append(str(c))
    cats = category or [""] * len(texts)
    refs = ref_answer or [""] * len(texts)
    rtns = ref_tool_name or [""] * len(texts)
    args = ref_tool_args if ref_tool_args is not None else [None] * len(texts)
    if not all(len(x) == len(texts) for x in (cats, refs, rtns, args)):
        raise ValueError("Reward labels/completions length mismatch")
    return [score_first_step(t, c, r, n, a) for t, c, r, n, a in zip(texts, cats, refs, rtns, args)]


# ── 训练 ─────────────────────────────────────────────────────────────────────

def main():
    if os.environ.get("GRPO_PREFLIGHT_APPROVED") != "1":
        raise RuntimeError("Training blocked: complete PROTOCOL.md preflight, then explicitly set GRPO_PREFLIGHT_APPROVED=1")
    global OUTPUT_DIR, FINAL_ADAPTER
    OUTPUT_DIR = os.environ["GRPO_OUTPUT_DIR"]
    FINAL_ADAPTER = str(Path(OUTPUT_DIR) / "final-adapter")
    if Path(OUTPUT_DIR).exists():
        raise FileExistsError("Use a fresh output directory; never overwrite old checkpoints")
    parent = Path(OUTPUT_DIR).parent
    if not parent.is_dir() or shutil.disk_usage(parent).free < 10 * 2**30:
        raise RuntimeError("Output parent must exist with at least 10 GiB free")
    print(f"[{time.strftime('%H:%M:%S')}] loading dataset...")
    rows = [json.loads(l) for l in Path(DATA).read_text(encoding="utf-8").splitlines() if l.strip()]
    errors = audit(rows)
    if errors or not rows:
        raise ValueError(f"Dataset preflight failed: {errors[:20]}")
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
    base = prepare_model_for_kbit_training(base)
    model = PeftModel.from_pretrained(base, SFT_ADAPTER, is_trainable=True)
    model.print_trainable_parameters()

    cfg = GRPOConfig(
        output_dir=OUTPUT_DIR,
        num_train_epochs=1,
        max_steps=int(os.environ.get("GRPO_MAX_STEPS", "30")),
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
        save_steps=10,
        save_total_limit=2,
        report_to="none",
        optim="adamw_torch",
        seed=42,
        shuffle_dataset=True,
        use_vllm=False,
    )

    trainer = GRPOTrainer(model=model, reward_funcs=composite_reward, args=cfg,
                          train_dataset=ds, processing_class=tok)
    class DiskGuard(TrainerCallback):
        def on_step_begin(self, args, state, control, **kwargs):
            if shutil.disk_usage(parent).free < 10 * 2**30:
                raise RuntimeError("Disk guard: less than 10 GiB free; stopping before next step")
        def on_save(self, args, state, control, **kwargs):
            self.on_step_begin(args, state, control)
    trainer.add_callback(DiskGuard())
    print(f"[{time.strftime('%H:%M:%S')}] start GRPO training...")
    trainer.train()
    trainer.save_model(FINAL_ADAPTER)
    tok.save_pretrained(FINAL_ADAPTER)
    print(f"GRPO_DONE adapter saved -> {FINAL_ADAPTER}")


if __name__ == "__main__":
    main()
