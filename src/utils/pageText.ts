import type { DocumentPage } from "./extractText";

/**
 * Plain text of one page for export. QARI click-to-read pages have no real page text (the
 * words are read one click at a time), so theirs is rebuilt from the word boxes in reading
 * order: lines top to bottom, words right to left, using QARI's reading where a word was
 * clicked and Tesseract's guess otherwise.
 */
export function pageExportText(page: DocumentPage): string {
  const words = page.ocrPage?.words;
  if (!words?.some((word) => word.needsRead !== undefined)) return page.text;

  const lines: Array<typeof words> = [];
  for (const word of [...words].sort((a, b) => a.yPct - b.yPct || b.xPct - a.xPct)) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].yPct - word.yPct) < word.heightPct * 0.5) {
      line.push(word);
    } else {
      lines.push([word]);
    }
  }
  return lines
    .map((line) =>
      line
        .sort((a, b) => b.xPct - a.xPct)
        .map((word) => word.text)
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

export function documentExportText(pages: DocumentPage[]): string {
  if (pages.length === 1) return pageExportText(pages[0]);
  return pages.map((page) => `--- Page ${page.pageIndex + 1} ---\n${pageExportText(page).trim()}`).join("\n\n");
}
