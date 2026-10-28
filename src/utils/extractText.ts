import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import mammoth from "mammoth";
import type { ExtractionSourceKind, OcrPageResult, OcrResult } from "../types";
import { arabicDensity } from "./arabicText";
import { recognizeArabicText } from "./ocr";
import { recognizeWithGoogleVision } from "./ocrGoogleVision";
import { locateWordsForQari } from "./qari";
import type { OcrEngine } from "../repositories/ocrSettings";

export type OcrOptions = {
  engine: OcrEngine;
  googleVisionApiKey?: string;
};

/** pageWidth/pageHeight (pixels) are only used by the free Tesseract path - Google Vision
 * reports its own page dimensions in the response, so it ignores them. */
async function runOcr(dataUrl: string, pageWidth: number, pageHeight: number, dpi: number, ocr: OcrOptions): Promise<OcrResult> {
  if (ocr.engine === "google-vision") {
    const apiKey = ocr.googleVisionApiKey?.trim();
    if (!apiKey) {
      throw new Error("Paste your Google Cloud Vision API key in Settings first, or switch OCR back to Free.");
    }
    return recognizeWithGoogleVision(dataUrl, apiKey);
  }
  if (ocr.engine === "qari-click") {
    return locateWordsForQari(dataUrl, pageWidth, pageHeight, dpi);
  }
  return recognizeArabicText(dataUrl, pageWidth, pageHeight, dpi);
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const minArabicDensityForTextLayer = 0.25;
// A PDF point is defined as 1/72in, and pdf.js's viewport scale is pixels-per-point, so
// this scale factor works out to ~288 DPI - close to the ~300 DPI Tesseract needs to
// reliably resolve small Arabic harakat marks. The previous scale of 2 (~144 DPI) was
// the main reason OCR quality was poor even on genuinely clean/high-quality source PDFs.
const ocrRenderScale = 4;
const ocrRenderDpi = 72 * ocrRenderScale;

/** One extracted page: its text, and (for OCR'd pages) the page image with every word's position. */
export type DocumentPage = {
  pageIndex: number;
  text: string;
  source: ExtractionSourceKind;
  ocrPage?: OcrPageResult;
};

/**
 * An opened file whose pages are extracted one at a time, so the reader can show each page as
 * soon as it's done and the visitor can Stop and Resume between pages. Pages can be requested in
 * any order, and again after a Stop.
 */
export type DocumentSession = {
  pageCount: number;
  extractPage: (
    pageIndex: number,
    ocr: OcrOptions,
    signal: AbortSignal,
    onStatus: (message: string) => void,
  ) => Promise<DocumentPage>;
};

export async function openDocument(file: File, onStatus: (message: string) => void): Promise<DocumentSession> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".txt") || file.type === "text/plain") {
    const text = await file.text();
    return textSession({ pageIndex: 0, text, source: "text-layer" });
  }

  if (
    lowerName.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    onStatus("Reading .docx text...");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });

    if (!value.trim()) {
      throw new Error(
        "No extractable text found in this .docx file. Scanned images embedded in .docx aren't supported yet — export to PDF or an image first.",
      );
    }

    return textSession({ pageIndex: 0, text: value, source: "text-layer" });
  }

  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    return openPdf(file);
  }

  if (file.type.startsWith("image/")) {
    return {
      pageCount: 1,
      extractPage: async (pageIndex, ocr, signal, onPageStatus) => {
        onPageStatus("Running OCR on image (this can take a moment)...");
        const dataUrl = await fileToDataUrl(file);
        const { width, height } = await getImageDimensions(dataUrl);
        const { text, words } = await runOcr(dataUrl, width, height, 300, ocr);
        signal.throwIfAborted();
        return { pageIndex, text, source: "ocr", ocrPage: { imageDataUrl: dataUrl, words } };
      },
    };
  }

  throw new Error(`Unsupported file type for ${file.name}. Use .txt, .docx, .pdf, or an image.`);
}

function textSession(page: DocumentPage): DocumentSession {
  return { pageCount: 1, extractPage: async () => page };
}

async function openPdf(file: File): Promise<DocumentSession> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  return {
    pageCount: pdf.numPages,
    extractPage: async (pageIndex, ocr, signal, onStatus) => {
      const pageNumber = pageIndex + 1;
      onStatus(`Reading page ${pageNumber} of ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");

      if (arabicDensity(pageText) >= minArabicDensityForTextLayer) {
        return { pageIndex, text: pageText, source: "text-layer" };
      }

      const rendered = await renderPageToDataUrl(page);
      onStatus(`Running OCR on page ${pageNumber} of ${pdf.numPages} (this can take a moment)...`);
      const { text, words } = await runOcr(rendered.dataUrl, rendered.width, rendered.height, ocrRenderDpi, ocr);
      signal.throwIfAborted();
      return { pageIndex, text, source: "ocr", ocrPage: { imageDataUrl: rendered.dataUrl, words } };
    },
  };
}

async function renderPageToDataUrl(page: PDFPageProxy): Promise<{ dataUrl: string; width: number; height: number }> {
  const viewport = page.getViewport({ scale: ocrRenderScale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  await page.render({ canvasContext: context, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read this image's dimensions."));
    image.src = dataUrl;
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
