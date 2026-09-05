"""Create frozen family splits and task metadata; prompt comes from the actual tool registry."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from park_agent_loop import post_json


def prepare_rows(tasks, env_url):
    result = {"train-early": [], "train-mid": [], "train-late": [], "validation": [], "test": []}
    for task in tasks:
        if task.get("split") not in ("train", "validation", "test"):
            raise ValueError("Freeze family split before preparing training data")
        messages = post_json(env_url, "/prompt", task)["messages"]
        phases = ["early","mid","late"] if task["split"] == "train" else ["mid"]
        for phase in phases:
            if phase == "early" and task["difficultyHint"] == "hard":
                continue
            row = {"data_source":"park", "prompt": messages, "agent_name":"park_agent",
                   "ability":task["category"], "reward_model":{"style":"rule","ground_truth":""},
                   "extra_info":{"task":task,"rewardPhase":phase}}
            key = "train-"+phase if task["split"] == "train" else task["split"]
            result[key].append(row)
    return result


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",default="data/rl/seeds_augmented.jsonl")
    ap.add_argument("--out",default="data/rl/verl")
    ap.add_argument("--env-url",default="http://127.0.0.1:8100")
    args=ap.parse_args()
    raw=Path(args.input).read_bytes()
    tasks=[json.loads(x) for x in raw.splitlines() if x.strip()]
    snapshot=os.environ.get("PARK_SNAPSHOT_AT")
    if not snapshot:raise ValueError("Freeze PARK_SNAPSHOT_AT before preparing prompts")
    tasks=[{**t,"snapshotAt":snapshot} for t in tasks]
    rows=prepare_rows(tasks,args.env_url)
    import pyarrow as pa
    import pyarrow.parquet as pq
    output=Path(args.out);output.mkdir(parents=True,exist_ok=False)
    for key,value in rows.items():
        if not value:raise ValueError(f"Empty split: {key}")
        pq.write_table(pa.Table.from_pylist(value), output/f"{key}.parquet")
    (output/"manifest.json").write_text(json.dumps({"input_sha256":hashlib.sha256(raw).hexdigest(),
        "counts":{k:len(v) for k,v in rows.items()},"protocol":"park-full-multiturn-v1"},indent=2))


if __name__=="__main__":main()
