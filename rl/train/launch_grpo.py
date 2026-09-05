"""Compose pinned veRL defaults and launch the canonical full-episode experiment."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["early","mid","late"],default="early")
    ap.add_argument("--resume", help="Previous veRL checkpoint; preserves the original SFT KL reference")
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()
    if args.phase!="early" and not args.resume:raise ValueError("Later phases must resume the previous phase checkpoint")
    root=Path(__file__).resolve().parents[2]
    if not args.dry_run:subprocess.run([sys.executable,str(root/"rl/train/full_preflight.py"),"grpo"],check=True)
    import verl
    from hydra import compose, initialize_config_dir
    from omegaconf import OmegaConf, open_dict
    configdir=Path(verl.__file__).parent/"trainer/config"
    with initialize_config_dir(config_dir=str(configdir),version_base=None):
        base=compose(config_name="ppo_trainer")
    overrides=OmegaConf.load(root/"rl/train/grpo_verl.yaml")
    del overrides["defaults"]
    # RolloutConfig declares custom, while the pinned YAML omits the optional field.
    with open_dict(base.actor_rollout_ref.rollout):
        base.actor_rollout_ref.rollout.custom = overrides.actor_rollout_ref.rollout.custom
    config=OmegaConf.merge(base,overrides)
    config.data.train_files=str(root/f"data/rl/verl/train-{args.phase}.parquet")
    config.trainer.experiment_name=args.phase
    config.trainer.default_local_dir=str(root/f"outputs/grpo-{args.phase}")
    config.trainer.rollout_data_dir=config.trainer.default_local_dir+"/rollouts"
    config.trainer.validation_data_dir=config.trainer.default_local_dir+"/validation"
    if args.resume:
        config.trainer.resume_mode="resume_path"
        config.trainer.resume_from_path=str(Path(args.resume).resolve())
        # veRL uses an absolute epoch target when resuming; advance one curriculum stage.
        config.trainer.total_epochs={"early":1,"mid":2,"late":3}[args.phase]
    if config.actor_rollout_ref.model.lora_rank!=0:raise ValueError("Unexpected LoRA")
    if args.dry_run:
        print(OmegaConf.to_yaml(config,resolve=False));return
    endpoint=config.actor_rollout_ref.rollout.custom.environment_url
    with urllib.request.urlopen(endpoint+"/health",timeout=10) as response:health=json.load(response)
    if health.get("judge")!="LLMJudge":raise ValueError("Full training requires the configured LLM Judge, not the smoke-test heuristic")
    target=Path(config.trainer.default_local_dir)
    target.mkdir(parents=True,exist_ok=False)
    (target/"resolved-config.yaml").write_text(OmegaConf.to_yaml(config,resolve=True))
    # Keep the initial SFT model path fixed in every phase for the frozen KL reference.
    from verl.trainer.main_ppo import main as verl_main
    verl_main.__wrapped__(config)


if __name__=="__main__":main()
