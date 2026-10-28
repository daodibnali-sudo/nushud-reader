"""
Local QARI-OCR server (dev-only). Runs NAMAA-Space/Qari-OCR-0.2.2.1-VL-2B-Instruct — the
"QARI v0.2" model from arXiv:2506.02295 — on Apple Silicon via MLX, 8-bit quantized.

The published checkpoint is a LoRA adapter on a bitsandbytes 4-bit Qwen2-VL-2B base, which
doesn't run on Mac and is very slow under PyTorch/MPS on a 16GB machine. setup.sh merges the
adapter into the full-precision base and converts it to an 8-bit MLX model in models/.

    POST /ocr   multipart field "image" -> {"text": "..."}
    POST /cancel                        -> stops the page being read right now (the app's Stop button)
    GET  /health                        -> {"ok": true, "model": "..."}
"""

import os
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from mlx_vlm import load, stream_generate
from mlx_vlm.prompt_utils import apply_chat_template

MODEL_PATH = os.environ.get("QARI_MODEL", str(Path(__file__).parent / "models" / "qari-mlx-8bit"))
MAX_NEW_TOKENS = int(os.environ.get("QARI_MAX_NEW_TOKENS", "2000"))

# Prompt taken verbatim from the model card — the adapter was trained against it.
PROMPT = (
    "Below is the image of one page of a document, as well as some raw textual content that was "
    "previously extracted for it. Just return the plain text representation of this document as "
    "if you were reading it naturally. Do not hallucinate."
)

print(f"Loading {MODEL_PATH}...", flush=True)
model, processor = load(MODEL_PATH)
formatted_prompt = apply_chat_template(processor, model.config, PROMPT, num_images=1)
# MLX isn't safe to call from several threads at once; FastAPI runs sync endpoints in a pool.
generate_lock = threading.Lock()
cancel_requested = threading.Event()
print("QARI-OCR ready.", flush=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_PATH, "wholePage": True}


def trim_repetition_loop(text: str) -> str | None:
    """QARI occasionally gets stuck repeating a phrase until max_tokens. Returns the text cut
    at the loop's first repeat if the last stretch is the same chunk over and over, else None."""
    # A looping phrase can be a few words or a whole sentence, so look back far enough for both.
    window = text[-1500:]
    tail = text[-50:]
    if len(text) < 300 or window.count(tail) < 3:
        return None
    return text[: len(text) - len(window) + window.index(tail) + len(tail)]


@app.post("/cancel")
def cancel():
    cancel_requested.set()
    return {"ok": True}


@app.post("/ocr")
def ocr(image: UploadFile = File(...)):
    suffix = Path(image.filename or "page.png").suffix or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix) as image_file:
        image_file.write(image.file.read())
        image_file.flush()
        started = time.time()
        pieces = []
        try:
            with generate_lock:
                cancel_requested.clear()
                for chunk in stream_generate(
                    model,
                    processor,
                    formatted_prompt,
                    image=image_file.name,
                    max_tokens=MAX_NEW_TOKENS,
                    temperature=0.0,
                ):
                    if cancel_requested.is_set():
                        print(f"OCR: cancelled after {time.time() - started:.1f}s", flush=True)
                        raise HTTPException(status_code=499, detail="Cancelled")
                    pieces.append(chunk.text)
                    if len(pieces) % 20 == 0 and (trimmed := trim_repetition_loop("".join(pieces))):
                        print("OCR: stopped a repetition loop", flush=True)
                        pieces = [trimmed]
                        break
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"OCR failed: {error}")
    print(f"OCR: {len(pieces)} tokens in {time.time() - started:.1f}s", flush=True)
    return {"text": "".join(pieces).strip()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("QARI_PORT", "8765")))
