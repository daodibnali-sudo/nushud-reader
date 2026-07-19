import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import mammoth from "mammoth";
import type { ExtractionPageResult, ExtractionResult } from "../types";
import { arabicDensity } from "./arabicText";
import { recognizeArabicText } from "./ocr";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const minArabicDensityForTextLayer = 0.25;
const ocrRenderScale = 2;

export async function extractFromFile(file: File, onStatus: (message: string) => void): Promise<ExtractionResult> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".txt") || file.type === "text/plain") {
    const text = await file.text();
    return {
      fileName: file.name,
      fullText: text,
      pages: [{ pageIndex: 0, text, source: "text-layer" }],
      usedOcrPageCount: 0,
    };
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

    return {
      fileName: file.name,
      fullText: value,
      pages: [{ pageIndex: 0, text: value, source: "text-layer" }],
      usedOcrPageCount: 0,
    };
  }

  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    return extractFromPdf(file, onStatus);
  }

  if (file.type.startsWith("image/")) {
    onStatus("Running OCR on image (this can take a moment)...");
    const dataUrl = await fileToDataUrl(file);
    const text = await recognizeArabicText(dataUrl);
    return {
      fileName: file.name,
      fullText: text,
      pages: [{ pageIndex: 0, text, source: "ocr" }],
      usedOcrPageCount: 1,
    };
  }

  throw new Error(`Unsupported file type for ${file.name}. Use .txt, .docx, .pdf, or an image.`);
}

async function extractFromPdf(file: File, onStatus: (message: string) => void): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: ExtractionPageResult[] = new Array(pdf.numPages);
  const pagesNeedingOcr: Array<{ pageIndex: number; dataUrl: string }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onStatus(`Reading page ${pageNumber} of ${pdf.numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");

    if (arabicDensity(pageText) >= minArabicDensityForTextLayer) {
      pages[pageNumber - 1] = { pageIndex: pageNumber - 1, text: pageText, source: "text-layer" };
    } else {
      const dataUrl = await renderPageToDataUrl(page);
      pagesNeedingOcr.push({ pageIndex: pageNumber - 1, dataUrl });
    }
  }

  for (const ocrPage of pagesNeedingOcr) {
    onStatus(`Running OCR on page ${ocrPage.pageIndex + 1} of ${pdf.numPages} (this can take a moment)...`);
    const text = await recognizeArabicText(ocrPage.dataUrl);
    pages[ocrPage.pageIndex] = { pageIndex: ocrPage.pageIndex, text, source: "ocr" };
  }

  const resolvedPages = pages.filter((page): page is ExtractionPageResult => Boolean(page));

  return {
    fileName: file.name,
    fullText: resolvedPages.map((page) => page.text).join("\n\n"),
    pages: resolvedPages,
    usedOcrPageCount: pagesNeedingOcr.length,
  };
}

async function renderPageToDataUrl(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: ocrRenderScale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
