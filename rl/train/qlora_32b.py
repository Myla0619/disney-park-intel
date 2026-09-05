#!/usr/bin/env python3
"""
QLoRA SFT for Qwen2.5-32B-Instruct on single A800 80G.
Uses 4-bit quantization + LoRA to fit in ~60GB VRAM.
"""

if __name__ == "__main__":
    raise SystemExit("Historical adapter entrypoint retired. Use rl/train/run_all.sh for the full-parameter pipeline.")

import os
import json
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from pathlib import Path
from sft_data import split_families, encode_sample, split_manifest
from weighted_sft import WeightedCollator, make_weighted_trainer_class

MODEL_ID = "/root/autodl-tmp/models/qwen32b"
DATA_PATH = "/root/autodl-tmp/disney-park-intel/data/rl/llamafactory/park_sft_all.json"
OUTPUT_DIR = "/root/autodl-tmp/outputs/qlora-32b"

def main():
    if os.environ.get("SFT_PREFLIGHT_APPROVED") != "1":
        raise RuntimeError("Audit protocol, dataset and GPU versions before setting SFT_PREFLIGHT_APPROVED=1")
    output_dir = os.environ["SFT_OUTPUT_DIR"]
    if Path(output_dir).exists():
        raise FileExistsError("Use a fresh SFT_OUTPUT_DIR; historical checkpoints must remain unchanged")
    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print("Loading model in 4-bit...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        trust_remote_code=True,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    print("Setting up LoRA...")
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print("Loading data...")
    raw_bytes = Path(os.environ.get("SFT_DATA_PATH", DATA_PATH)).read_bytes()
    raw = json.loads(raw_bytes)
    train_rows, val_rows = split_families(raw)
    max_length = int(os.environ.get("SFT_MAX_LENGTH", "8192"))
    use_curriculum = os.environ.get("SFT_CURRICULUM", "0") == "1"
    train_samples = [encode_sample(r, tokenizer, max_length) for r in train_rows]
    val_samples = [encode_sample(r, tokenizer, max_length) for r in val_rows]
    normalizer = sum(r["weight"] for r in train_rows) / len(train_rows)
    print(f"{len(train_samples)} train / {len(val_samples)} validation samples; mean weight={normalizer}")
    from datasets import Dataset
    split = {"train": Dataset.from_list(train_samples), "test": Dataset.from_list(val_samples)}
    Path(output_dir).mkdir(parents=True, exist_ok=False)
    manifest = split_manifest(train_rows, val_rows, raw_bytes)
    manifest.update(max_length=max_length, curriculum="progress-20-60-v1" if use_curriculum else "off",
                    weight_normalizer=normalizer)
    Path(output_dir, "data-manifest.json").write_text(json.dumps(manifest, indent=2))

    print("Setting up trainer...")
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=16,
        learning_rate=1.0e-4,
        lr_scheduler_type="cosine",
        warmup_steps=5,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=5,
        save_steps=50,
        eval_strategy="steps",
        eval_steps=50,
        report_to="none",
        optim="adamw_torch",
        save_total_limit=3,
        remove_unused_columns=False,
    )

    trainer = make_weighted_trainer_class()(
        model=model,
        args=training_args,
        train_dataset=split["train"],
        eval_dataset=split["test"],
        processing_class=tokenizer,
        data_collator=WeightedCollator(tokenizer.pad_token_id),
        weight_normalizer=normalizer,
        use_curriculum=use_curriculum,
    )

    print("Starting training...")
    trainer.train()

    adapter_dir = str(Path(output_dir) / "final-adapter")
    print(f"Saving adapter to {adapter_dir}...")
    trainer.save_model(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    print("DONE!")

if __name__ == "__main__":
    main()
