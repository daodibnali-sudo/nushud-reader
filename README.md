# NUSHUD Reader

Upload any Arabic document (`.txt`, `.pdf`, `.docx`, or an image) and get back fully clickable
Arabic text. Scanned/image pages are OCR'd automatically, for free, in your browser
(Tesseract.js). Click any word to see 1-4 possible meanings in your chosen language — also free,
also in your browser, via a public translation endpoint. No AI, no root/wazn/morphology — just
the word and its translation, cached so the same word is never looked up twice. Save words to
"My Cards" (stored in your browser, no account needed).

**This app has no login and no paid backend. It's completely free, for anyone, forever** (as
long as the free services it depends on stay free).

It shares the same Supabase project as [NUSHUD](../../NUSHUD) and [nushudtools](../../../nushudtools),
but only for a small JSON cache — nothing here costs money or calls AI:

- Reads NUSHUD's shared `dictionary/words.json` as a free shortcut (read-only, via its public
  URL) — if a word's already in NUSHUD's curated English dictionary, it's used instantly instead
  of doing a fresh translation.
- Writes newly-translated words to its own `reader-dictionary/words.json` bucket, so arbitrary
  uploaded documents never touch the curated dictionary the mobile app ships, and so the next
  visitor (or the next document) reuses the same word instantly.

## How word lookup works

1. Every word is stripped of harakat/diacritics first (the same normalization NUSHUD already
   uses), so `كَتَبَ`, `كتب`, and `كَتب` are all treated as the same word for
   translation/caching purposes. The text you *read* still shows harakat exactly as extracted —
   this normalization only affects the lookup/translation/storage key, not the reading text.
2. Check this app's own cache first (instant, free).
3. Then check NUSHUD's shared dictionary — but only if you're translating to English, since
   that's the only language NUSHUD's curated dictionary has (instant, free).
4. Otherwise, ask a free public translation endpoint for that word, requesting up to 4 possible
   meanings (`translate.googleapis.com`'s unofficial "gtx" client — the same trick many free
   translation widgets use directly from the browser, no API key, no backend call).
5. Newly-translated words are saved back to the shared `reader-dictionary/words.json`, so nobody
   ever pays (in time or money) to look up the same word twice.

This endpoint is unofficial and free — it could occasionally get rate-limited or change. If that
becomes a real problem, the fix is to move the same call behind a tiny Supabase Edge Function
(so it's a shared server-side call instead of many browser calls), not to switch to a paid API.

## Backend setup (already done, nothing new needed)

The `reader-dictionary` storage bucket migration was already applied in an earlier setup pass.
There is nothing left to deploy — OCR and translation are both fully client-side now. (Two
now-unused Edge Functions from an earlier, AI-based version of this app —
`reader-generate-dictionary-entries` and `reader-ocr-arabic-text` — were removed from the
`nushudtools` repo since nothing calls them anymore. This did not touch the `generate-dictionary-entries`
/ `ocr-arabic-text` functions nushudtools' own admin tooling uses.)

## Local development

```bash
cp .env.example .env
# edit .env: paste the same VITE_SUPABASE_ANON_KEY from NUSHUD/.env
npm install
npm run dev
```

No sign-in step — the app just opens.

## Limitations

- Scanned images embedded inside `.docx` files aren't OCR'd yet (export to PDF or an image
  first) — only PDF pages and standalone image uploads go through the OCR path.
- Saved cards live only in the browser that saved them (no account, no sync across devices).
- Tesseract.js OCR is free but noticeably weaker than a paid vision model at reading harakat
  (diacritics) — expect it to often miss or misread vocalization marks, especially on lower
  quality scans. It downloads its Arabic model (`ara.traineddata`) from a public CDN the first
  time OCR runs, so that first OCR needs an internet connection and takes a few extra seconds.
- No morphology: root, wazn, forms, bab, and part of speech are not shown — this app only gives
  a translation (1-4 meanings), nothing else.
- The free translation endpoint is unofficial; expect occasional failures on a given word (the
  status bar reports how many words failed after analysis finishes).
