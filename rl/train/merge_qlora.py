#!/usr/bin/env python3
"""Merge QLoRA adapter back into base model and export."""
if __name__ == "__main__":
    raise SystemExit("Historical adapter entrypoint retired. Use rl/train/run_all.sh for the full-parameter pipeline.")

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "/root/autodl-tmp/models/qwen32b"
ADAPTER = "/root/autodl-tmp/outputs/qlora-32b-adapter"
MERGED = "/root/autodl-tmp/outputs/qlora-32b-merged"

print("Loading base model...")
base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map="cpu", trust_remote_code=True)
tokenizer = AutoTokenizer.from_pretrained(ADAPTER)

print("Loading adapter...")
model = PeftModel.from_pretrained(base, ADAPTER)

print("Merging...")
model = model.merge_and_unload()

print(f"Saving merged model to {MERGED}...")
model.save_pretrained(MERGED, safe_serialization=True)
tokenizer.save_pretrained(MERGED)
print("DONE!")
