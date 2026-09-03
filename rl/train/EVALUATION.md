# Controlled SFT / GRPO comparison

1. Export one full prompt from the runtime registry with a fixed date:

```bash
npx tsx rl/eval/export_prompt.ts shanghai 2026-09-04 /tmp/park-prompt.txt
```

2. Use the SAME held-out JSONL file for both checkpoints. Each row needs `query`,
   `category`, and preferably a manually verified `expected_tools` list. An empty
   list means no tool is needed. Category fallback labels are only first-step
   proxies, not proof that a multi-intent task is solved. The old 50/44-row GPU
   evaluation files are not checked in; do not recreate them silently from seeds.

3. Run each adapter with identical base/tokenizer, prompt and decoding settings:

```bash
python rl/train/eval_adapter.py --base-model /models/base --base-id BASE_REVISION \
  --adapter /models/sft --checkpoint-id SFT_HASH --prompt /tmp/park-prompt.txt \
  --eval-set /data/held-out.jsonl --out /tmp/sft-new.json
python rl/train/eval_adapter.py --base-model /models/base --base-id BASE_REVISION \
  --adapter /models/grpo --checkpoint-id GRPO_HASH --prompt /tmp/park-prompt.txt \
  --eval-set /data/held-out.jsonl --out /tmp/grpo-new.json
python rl/train/eval_common.py /tmp/sft-new.json /tmp/grpo-new.json
```

Alternatively use `eval_model.py --base-url http://localhost:8200/v1 --model NAME`
with the same shared arguments. Do not compare different backend runs. Checkpoint
and base identifiers are operator-supplied: use immutable revisions or hashes.
The new named CLI flags replace the old positional adapter arguments.

Outputs include the full prompt, prompt/test/evaluator hashes, checkpoint/base
identifiers, decoding, raw response, labels and parse/request errors per sample.
The comparison rejects legacy files, mismatched settings and request failures.
`arguments_present` checks required keys only; it does NOT validate argument
values against tool schemas. `has_answer` is a first-response tag count, not final
answer quality. No tools run in this evaluation.

Before retraining, audit the actual SFT assistant targets and GRPO prompt data:
model requests must use `tool_call`, tool results use `tool_response`. Do not
globally replace tool_response in transcripts; genuine tool responses must stay.
Existing adapters trained on the old protocol may fail the corrected evaluation.
Run corrected evaluations before deciding whether retraining is necessary.

Offline checks:

```bash
python3 -m unittest discover -s rl/train -p 'test_*.py'
```
