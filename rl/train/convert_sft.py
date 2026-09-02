#!/usr/bin/env python3
"""
把 data/rl/sft/train.jsonl（clean.ts 输出）转成 LLaMA-Factory sharegpt 格式。

用法：
  python rl/train/convert_sft.py                       # 全部样本
  python rl/train/convert_sft.py --pass-only           # 只要 pass（丢 borderline）
  python rl/train/convert_sft.py --difficulty easy medium   # 课程学习分阶段导出

说明：LLaMA-Factory 不支持逐样本 loss 权重，borderline 的 0.6 权重两种落地方式：
  ① --pass-only 直接过滤（质量优先，样本少时不推荐）
  ② 全保留（默认，多样性优先）；换 ms-swift 时可直接用 weight 字段
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "data" / "rl" / "sft" / "train.jsonl"
OUT_DIR = ROOT / "data" / "rl" / "llamafactory"

ROLE_MAP = {"system": "system", "user": "human", "assistant": "gpt"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass-only", action="store_true")
    ap.add_argument("--difficulty", nargs="*", default=None, help="easy/medium/hard 过滤")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    samples = [json.loads(l) for l in SRC.read_text(encoding="utf-8").splitlines() if l.strip()]
    if args.pass_only:
        samples = [s for s in samples if s["quality"] == "pass"]
    if args.difficulty:
        samples = [s for s in samples if s["difficulty"] in args.difficulty]

    converted = []
    for s in samples:
        conv = [{"from": ROLE_MAP[m["role"]], "value": m["content"]} for m in s["messages"]]
        converted.append({"conversations": conv})

    suffix = "_".join(args.difficulty) if args.difficulty else ("pass" if args.pass_only else "all")
    out = Path(args.out) if args.out else OUT_DIR / f"park_sft_{suffix}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(converted, ensure_ascii=False, indent=1), encoding="utf-8")

    # dataset_info.json：LLaMA-Factory 的数据集注册表（把 OUT_DIR 配为 dataset_dir 即可）
    info_path = OUT_DIR / "dataset_info.json"
    info = json.loads(info_path.read_text(encoding="utf-8")) if info_path.exists() else {}
    info[out.stem] = {
        "file_name": out.name,
        "formatting": "sharegpt",
        "columns": {"messages": "conversations"},
        "tags": {"role_tag": "from", "content_tag": "value", "user_tag": "human", "assistant_tag": "gpt", "system_tag": "system"},
    }
    info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{len(converted)} samples -> {out}")
    print(f"dataset_info updated: {info_path} (dataset name: {out.stem})")


if __name__ == "__main__":
    main()
