#!/usr/bin/env bash
# One-time setup: builds models/qari-mlx-8bit (~2.8GB). Needs Apple Silicon + uv (brew install uv).
set -euo pipefail
cd "$(dirname "$0")"

# 1. Merge the QARI LoRA into full-precision Qwen2-VL-2B (needs the older transformers it was trained with).
uv venv --python 3.12 .venv-merge
uv pip install --python .venv-merge/bin/python -r requirements-merge.txt
.venv-merge/bin/python merge_adapter.py models/qari-merged-fp16

# 2. Convert to 8-bit MLX and install the server's runtime deps.
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m mlx_vlm.convert --hf-path models/qari-merged-fp16 --mlx-path models/qari-mlx-8bit -q --q-bits 8

rm -rf models/qari-merged-fp16 .venv-merge
echo "Done. Start with: npm run qari"
