#!/usr/bin/env python3
"""
QLoRA SFT for Qwen2.5-32B-Instruct on single A800 80G.
Uses 4-bit quantization + LoRA to fit in ~60GB VRAM.
"""

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
from trl import SFTTrainer, SFTConfig

MODEL_ID = "/root/autodl-tmp/models/qwen32b"
DATA_PATH = "/root/autodl-tmp/disney-park-intel/data/rl/llamafactory/park_sft_all.json"
OUTPUT_DIR = "/root/autodl-tmp/outputs/qlora-32b"

def main():
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
    with open(DATA_PATH, "r") as f:
        raw = json.load(f)

    samples = []
    for item in raw:
        convs = item["conversations"]
        messages = []
        for c in convs:
            role = "system" if c["from"] == "system" else ("user" if c["from"] == "human" else "assistant")
            messages.append({"role": role, "content": c["value"]})
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        samples.append({"text": text})

    print(f"{len(samples)} training samples")
    from datasets import Dataset
    dataset = Dataset.from_list(samples)
    split = dataset.train_test_split(test_size=0.05, seed=42)

    print("Setting up trainer...")
    training_args = SFTConfig(
        output_dir=OUTPUT_DIR,
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
        dataset_kwargs={"max_length": 8192},
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=split["train"],
        eval_dataset=split["test"],
        processing_class=tokenizer,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving adapter to {OUTPUT_DIR}-adapter...")
    trainer.save_model(f"{OUTPUT_DIR}-adapter")
    tokenizer.save_pretrained(f"{OUTPUT_DIR}-adapter")
    print("DONE!")

if __name__ == "__main__":
    main()
