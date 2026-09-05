"""Explicit sample weights, seed-family splits and assistant-only token targets."""
import hashlib
import math
import random
import re


def validate_metadata(row):
    if not isinstance(row.get("taskId"), str) or not row["taskId"].strip():
        raise ValueError("Missing taskId: old exports must be regenerated, not assigned synthetic provenance")
    w = row.get("weight")
    if type(w) not in (int, float) or not math.isfinite(w) or not 0 < w <= 1:
        raise ValueError("weight must be finite and in (0, 1]")
    if row.get("difficulty") not in ("easy", "medium", "hard"):
        raise ValueError("Invalid difficulty")
    if not isinstance(row.get("category"), str) or not row["category"]:
        raise ValueError("Missing category")


def seed_family(task_id):
    # augment.ts suffix; repeated augmentation stays in the original family.
    return re.sub(r"(?:-v\d+)+$", "", task_id)


def split_families(rows, fraction=0.05, seed=42):
    if not 0 < fraction < 1:
        raise ValueError("Validation fraction must be in (0, 1)")
    for r in rows:
        validate_metadata(r)
    families = sorted({seed_family(r["taskId"]) for r in rows})
    if len(families) < 2:
        raise ValueError("Need at least two independent seed families")
    random.Random(seed).shuffle(families)
    count = min(len(families) - 1, max(1, round(len(families) * fraction)))
    val_ids = set(families[:count])
    train = [r for r in rows if seed_family(r["taskId"]) not in val_ids]
    val = [r for r in rows if seed_family(r["taskId"]) in val_ids]
    # Exact text copied under a new ID is also leakage; semantic overlap needs review.
    def queries(rs):
        return {c["value"].strip() for r in rs for c in r["conversations"]
                if c["from"] == "human" and "<tool_response>" not in c["value"]}
    if queries(train) & queries(val):
        raise ValueError("Identical user query crosses the seed-family split")
    return train, val


def encode_sample(row, tokenizer, max_length):
    from eval_common import parse_output
    validate_metadata(row)
    role_map = {"system": "system", "human": "user", "gpt": "assistant"}
    messages = [{"role": role_map[c["from"]], "content": c["value"]} for c in row["conversations"]]
    if len(messages) < 3 or [m["role"] for m in messages[:2]] != ["system", "user"]:
        raise ValueError("Expected system, user and assistant transcript")
    for i, m in enumerate(messages):
        if i > 1 and m["role"] != ("assistant" if i % 2 == 0 else "user"):
            raise ValueError("Transcript role order mismatch")
        if m["role"] == "assistant" and not parse_output(m["content"])["format_ok"]:
            raise ValueError(f"Invalid assistant protocol in {row['taskId']}")
    if messages[-1]["role"] != "assistant":
        raise ValueError("Transcript must end in assistant")
    ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
    if len(ids) > max_length:
        raise ValueError(f"{row['taskId']} has {len(ids)} tokens > {max_length}; refusing silent truncation")
    labels = [-100] * len(ids)
    for i, msg in enumerate(messages):
        if msg["role"] != "assistant":
            continue
        prefix = tokenizer.apply_chat_template(messages[:i], tokenize=True, add_generation_prompt=True)
        end = tokenizer.apply_chat_template(messages[:i + 1], tokenize=True, add_generation_prompt=False)
        if ids[:len(prefix)] != prefix or ids[:len(end)] != end or len(end) <= len(prefix):
            raise ValueError("Chat template is not prefix-stable; inspect token boundaries before training")
        labels[len(prefix):len(end)] = ids[len(prefix):len(end)]
    if not any(x != -100 for x in labels[1:]):
        raise ValueError("No assistant prediction targets")
    return dict(input_ids=ids, attention_mask=[1] * len(ids), labels=labels, sample_weight=float(row["weight"]),
                difficulty_id={"easy": 0, "medium": 1, "hard": 2}[row["difficulty"]])


def split_manifest(train, val, raw_bytes):
    return dict(version="weighted-assistant-sft-v1", data_sha256=hashlib.sha256(raw_bytes).hexdigest(),
                train_ids=[r["taskId"] for r in train], validation_ids=[r["taskId"] for r in val],
                split="seed family; exact-query overlap rejected; semantic overlap not certified")
