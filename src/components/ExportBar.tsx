import { useState } from "react";

type ExportBarProps = {
  fileName: string;
  text: string;
  /** Set while only some pages are done, e.g. "3/10 pages", so it's clear what a download includes. */
  partialLabel: string | null;
};

export function ExportBar({ fileName, text, partialLabel }: ExportBarProps) {
  const [copied, setCopied] = useState(false);
  const baseName = fileName.replace(/\.[^.]+$/, "") || "arabic-text";

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="export-bar">
      <button type="button" onClick={download} disabled={!text.trim()}>
        ⬇ Download .txt{partialLabel ? ` (${partialLabel})` : ""}
      </button>
      <button type="button" onClick={() => void copy()} disabled={!text.trim()}>
        {copied ? "✓ Copied" : "Copy text"}
      </button>
    </div>
  );
}
