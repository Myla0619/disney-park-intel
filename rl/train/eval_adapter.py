#!/usr/bin/env python3
"""Evaluate a LoRA adapter with the same prompt, parser and scoring as eval_model.py."""
from eval_common import parser, load_inputs, run


def main():
    ap = parser(__doc__)
    ap.add_argument("--base-model", required=True)
    ap.add_argument("--adapter", required=True)
    args = ap.parse_args()
    inputs = load_inputs(args)
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float16, device_map="auto")
    model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()
    def generate(messages):
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        tokens = tokenizer(text, return_tensors="pt", add_special_tokens=False).to(model.device)
        with torch.no_grad():
            output = model.generate(**tokens, max_new_tokens=args.max_tokens, do_sample=False)
        return tokenizer.decode(output[0][tokens["input_ids"].shape[1]:], skip_special_tokens=True)
    run(args, generate, "transformers-peft", inputs)


if __name__ == "__main__":
    main()
