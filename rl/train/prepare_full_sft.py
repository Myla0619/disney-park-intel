"""Materialize staged weighted ShareGPT data for LLaMA-Factory full-parameter SFT."""
import argparse
import hashlib
import json
from pathlib import Path
from sft_data import seed_family, validate_metadata

# Integer multiplicities implement exact relative exposure without relying on ignored metadata.
STAGES = {"early": {"pass": 10, "borderline": 3},
          "mid": {"pass": 20, "borderline": 9},
          "late": {"pass": 5, "borderline": 3}}


def prepare(samples, seeds):
    families = {s.get("familyId", s["id"]): s["split"] for s in seeds}
    buckets = {"train": [], "validation": [], "test": []}
    for row in samples:
        validate_metadata(row)
        family = seed_family(row["taskId"])
        if family not in families:
            raise ValueError("Sample family absent from frozen corpus")
        if row.get("quality") not in ("pass", "borderline"):
            raise ValueError("Missing reviewed sample quality")
        expected = 1.0 if row["quality"] == "pass" else 0.6
        if abs(row["weight"] - expected) > 1e-9:
            raise ValueError("Quality and weight mismatch")
        conv = [{"from": {"system": "system", "user": "human", "assistant": "gpt"}[m["role"]],
                 "value": m["content"]} for m in row["messages"]]
        buckets[families[family]].append({**row, "conversations": conv})
    if not buckets["train"] or not buckets["validation"]:
        raise ValueError("Need successful train AND held-out validation families")
    stages = {}
    for phase, counts in STAGES.items():
        eligible = [r for r in buckets["train"] if phase != "early" or r["difficulty"] != "hard"]
        if not eligible:
            raise ValueError("Empty curriculum phase")
        stages[phase] = [r for r in eligible for _ in range(counts[r["quality"]])]
    stages["validation"] = buckets["validation"]
    return stages, buckets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", default="data/rl/sft/train.jsonl")
    ap.add_argument("--seeds", default="data/rl/seeds.jsonl")
    ap.add_argument("--out", default="data/rl/full_sft")
    args = ap.parse_args()
    raw = Path(args.samples).read_bytes()
    seeds_raw = Path(args.seeds).read_bytes()
    samples = [json.loads(x) for x in raw.splitlines() if x.strip()]
    seeds = [json.loads(x) for x in seeds_raw.splitlines() if x.strip()]
    stages, buckets = prepare(samples, seeds)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    registry = {}
    for phase, rows in stages.items():
        name = f"park_{phase}"
        (out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False))
        registry[name] = {"file_name": f"{name}.json", "formatting": "sharegpt",
                          "columns": {"messages": "conversations"},
                          "tags": {"role_tag": "from", "content_tag": "value", "user_tag": "human",
                                   "assistant_tag": "gpt", "system_tag": "system"}}
    (out / "dataset_info.json").write_text(json.dumps(registry, indent=2))
    manifest = {"method": "full-parameter-sft", "source_sha256": hashlib.sha256(raw).hexdigest(),
                "corpus_sha256": hashlib.sha256(seeds_raw).hexdigest(), "exposure": STAGES,
                "stages": {k: len(v) for k, v in stages.items()},
                "split_ids": {k: [r["taskId"] for r in v] for k,v in buckets.items()}}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"unique_samples": len(samples), "stage_exposures": manifest["stages"]}))


if __name__ == "__main__":
    main()
