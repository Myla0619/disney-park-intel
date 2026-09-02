#!/bin/bash
# Master script: runs on GPU server to do full SFT pipeline
set -e

echo "=== Step 1: Check environment ==="
source /root/miniconda3/etc/profile.d/conda.sh
conda activate base
python -c "import torch; print(f'PyTorch {torch.__version__}, CUDA {torch.cuda.is_available()}, GPUs: {torch.cuda.device_count()}')"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

echo "=== Step 2: Convert SFT data ==="
cd /root/autodl-tmp/disney-park-intel
python rl/train/convert_sft.py
echo "SFT data converted"

echo "=== Step 3: Download model (if not cached) ==="
python -c "
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
print('Downloading Qwen2.5-32B-Instruct...')
t = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-32B-Instruct', trust_remote_code=True)
t.save_pretrained('/root/autodl-tmp/models/qwen32b')
print('Tokenizer downloaded. Model will be downloaded during training.')
"

echo "=== Step 4: Prepare eval seeds ==="
head -50 data/rl/seeds_augmented.jsonl > /root/autodl-tmp/eval_seeds.jsonl
echo "Eval seeds prepared"

echo "=== Step 5: Start QLoRA training ==="
python rl/train/qlora_32b.py 2>&1 | tee /root/autodl-tmp/train.log

echo "=== Step 6: Merge adapter ==="
python rl/train/merge_qlora.py 2>&1 | tee /root/autodl-tmp/merge.log

echo "=== Step 7: Serve and evaluate ==="
python -m vllm.entrypoints.openai.api_server \
    --model /root/autodl-tmp/outputs/qlora-32b-merged \
    --port 8200 --host 0.0.0.0 \
    --tensor-parallel-size 1 \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.9 \
    --trust-remote-code &
VLLM_PID=$!
echo "Waiting for vLLM to start..."
sleep 60

python rl/train/eval_model.py 2>&1 | tee /root/autodl-tmp/eval.log
kill $VLLM_PID

echo "=== ALL DONE ==="
echo "Results in /root/autodl-tmp/outputs/"
cat /root/autodl-tmp/outputs/eval_results.json
