"""One-off: merge the QARI LoRA adapter into full-precision Qwen2-VL-2B so it can be converted to MLX."""

import sys

import torch
from peft import PeftModel
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

ADAPTER_ID = "NAMAA-Space/Qari-OCR-0.2.2.1-VL-2B-Instruct"
out_dir = sys.argv[1]

base = Qwen2VLForConditionalGeneration.from_pretrained("Qwen/Qwen2-VL-2B-Instruct", torch_dtype=torch.float16)
PeftModel.from_pretrained(base, ADAPTER_ID).merge_and_unload().save_pretrained(out_dir)
AutoProcessor.from_pretrained(ADAPTER_ID).save_pretrained(out_dir)
print("merged ->", out_dir)
