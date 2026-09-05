#!/usr/bin/env bash
# Canonical pipeline only: explicit stages, full-parameter model checkpoints.
set -euo pipefail
cd "$(dirname "$0")/../.."
stage="${1:-help}"
case "$stage" in
  seeds) npm run data:seeds ;;
  augment) npx tsx rl/data/augment.ts --variants 5 --minimum 1800 ;;
  distill) npx tsx rl/data/distill.ts ;;
  clean) npx tsx rl/data/clean.ts --in data/rl/trajectories/teacher-full.jsonl --judge ;;
  prepare-sft) python rl/train/prepare_full_sft.py ;;
  sft-early|sft-mid|sft-late)
    phase="${stage#sft-}"
    python rl/train/full_preflight.py sft
    FORCE_TORCHRUN=1 llamafactory-cli train "rl/train/sft_full_${phase}.yaml"
    ;;
  prepare-rl) python rl/train/prepare_verl.py ;;
  grpo) python rl/train/launch_grpo.py "${@:2}" ;;
  *) echo 'Stages: seeds augment distill clean prepare-sft sft-early sft-mid sft-late prepare-rl grpo'; exit 2 ;;
esac
