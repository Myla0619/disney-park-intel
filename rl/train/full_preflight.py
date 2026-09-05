"""Fail early on absent GPU, data, wrong framework checkout or accidental adapters."""
import argparse
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
LOCK=json.loads((ROOT/"rl/train/framework-lock.json").read_text())


def check_framework(module, expected):
    spec=importlib.util.find_spec(module)
    if spec is None or spec.origin is None:raise RuntimeError(f"Install the pinned {module} source checkout")
    root=Path(spec.origin).parent
    sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
    if sha!=expected:raise RuntimeError(f"{module} source commit differs from framework-lock.json")


def main():
    import torch
    ap=argparse.ArgumentParser();ap.add_argument("stage",choices=["sft","grpo"]);args=ap.parse_args()
    if not torch.cuda.is_available():raise RuntimeError("Full-parameter GPU training needs the configured CUDA host")
    if torch.cuda.device_count()<8:raise RuntimeError("Canonical 32B configuration requires 8 GPUs; adapt memory/parallelism before using a smaller host")
    if args.stage=="sft":
        check_framework("llamafactory",LOCK["llamafactory_commit"])
        if not (ROOT/"data/rl/full_sft/manifest.json").exists():raise RuntimeError("Prepare reviewed SFT data first")
    else:
        check_framework("verl",LOCK["verl_commit"])
        p=ROOT/"outputs/full-sft-late"
        if (p/"adapter_config.json").exists():raise RuntimeError("GRPO must start from a full SFT checkpoint")
        config=json.loads((p/"config.json").read_text())
        if config.get("quantization_config"):raise RuntimeError("Canonical GRPO does not use a quantized base")
    print(json.dumps({"stage":args.stage,"gpu_count":torch.cuda.device_count(),"torch":torch.__version__,"training":"full"}))


if __name__=="__main__":main()
