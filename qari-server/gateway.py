"""
Public QARI-OCR gateway for a CPU machine (the Ubuntu/WSL laptop), reached through a Cloudflare
Tunnel at https://qari.nushud.com. It speaks the same API as server.py, so the reader app works
with either, and forwards each request to a local llama.cpp `llama-server` running the QARI model
converted to GGUF (see laptop-setup.md).

Because it's open to everyone, it only does the cheap job — reading one clicked word — and
protects the laptop:
  - images are capped in size, so nobody can send whole pages (minutes of CPU each)
  - each visitor gets a few reads per minute (keyed by Cloudflare's CF-Connecting-IP header)
  - at most QUEUE_LIMIT reads wait at once; beyond that it answers 503 "busy" right away
  - browsers may only call it from the reader site, arabicwordbyword.com (CORS)

    POST /ocr     multipart field "image" -> {"text": "..."}
    POST /cancel                          -> no-op (word reads are short; nobody may cancel others)
    GET  /health                          -> {"ok": true, "model": "...", "wholePage": false}
"""

import asyncio
import base64
import io
import os
import time
from collections import defaultdict, deque

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

LLAMA_URL = os.environ.get("QARI_LLAMA_URL", "http://127.0.0.1:8080")
MAX_UPLOAD_BYTES = int(os.environ.get("QARI_MAX_UPLOAD_BYTES", str(2 * 1024 * 1024)))
# A 3x-upscaled word crop is ~100k-300k pixels; a whole page is millions.
MAX_PIXELS = int(os.environ.get("QARI_MAX_PIXELS", "600000"))
MAX_NEW_TOKENS = int(os.environ.get("QARI_MAX_NEW_TOKENS", "48"))
QUEUE_LIMIT = int(os.environ.get("QARI_QUEUE_LIMIT", "6"))
READS_PER_MINUTE = int(os.environ.get("QARI_READS_PER_MINUTE", "20"))
ALLOWED_ORIGINS = (
    r"https://(www\.)?arabicwordbyword\.com|https://reader\.nushud\.com"
    r"|http://(127\.0\.0\.1|localhost)(:\d+)?"
)

# Prompt taken verbatim from the model card — the adapter was trained against it.
PROMPT = (
    "Below is the image of one page of a document, as well as some raw textual content that was "
    "previously extracted for it. Just return the plain text representation of this document as "
    "if you were reading it naturally. Do not hallucinate."
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# llama-server reads one image at a time on this CPU; extra requests wait here, up to QUEUE_LIMIT.
read_slot = asyncio.Semaphore(1)
waiting = 0
recent_reads: dict[str, deque[float]] = defaultdict(deque)
client = httpx.AsyncClient(timeout=120)


def visitor_of(request: Request) -> str:
    # Behind Cloudflare every request comes from the tunnel, so the real visitor is in this header.
    return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")


def allow_read(visitor: str) -> bool:
    now = time.monotonic()
    reads = recent_reads[visitor]
    while reads and now - reads[0] > 60:
        reads.popleft()
    if len(reads) >= READS_PER_MINUTE:
        return False
    reads.append(now)
    return True


@app.get("/health")
async def health():
    try:
        response = await client.get(f"{LLAMA_URL}/health", timeout=3)
        ready = response.status_code == 200
    except httpx.HTTPError:
        ready = False
    if not ready:
        raise HTTPException(status_code=503, detail="Model is not running")
    return {"ok": True, "model": "Qari-OCR-0.2.2.1 (llama.cpp, CPU)", "wholePage": False}


@app.post("/cancel")
def cancel():
    return {"ok": True}


@app.post("/ocr")
async def ocr(request: Request, image: UploadFile = File(...)):
    global waiting
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large: send one word at a time")
    try:
        picture = Image.open(io.BytesIO(data))
        picture.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image")
    if picture.width * picture.height > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="Image too large: send one word at a time")
    if not allow_read(visitor_of(request)):
        raise HTTPException(status_code=429, detail="Too many words read in the last minute; try again shortly")
    if waiting >= QUEUE_LIMIT:
        raise HTTPException(status_code=503, detail="QARI is busy; try again in a moment")

    png = io.BytesIO()
    picture.convert("RGB").save(png, "PNG")
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png.getvalue()).decode()}},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
        "temperature": 0,
        "max_tokens": MAX_NEW_TOKENS,
    }

    waiting += 1
    try:
        async with read_slot:
            started = time.time()
            try:
                response = await client.post(f"{LLAMA_URL}/v1/chat/completions", json=payload)
                response.raise_for_status()
            except httpx.HTTPError as error:
                raise HTTPException(status_code=502, detail=f"Model error: {error}")
            text = response.json()["choices"][0]["message"]["content"].strip()
            print(f"OCR: {picture.width}x{picture.height} -> {text!r} in {time.time() - started:.1f}s", flush=True)
            return {"text": text}
    finally:
        waiting -= 1


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("QARI_PORT", "8765")))
