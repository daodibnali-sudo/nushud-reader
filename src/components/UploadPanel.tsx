import { useState } from "react";

type UploadPanelProps = {
  onFile: (file: File) => void;
  disabled: boolean;
};

export function UploadPanel({ onFile, disabled }: UploadPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <fieldset
      className={isDragOver ? "drop-zone drag-over" : "drop-zone"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        if (disabled) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <legend>Upload a file</legend>
      <div className="form-row">
        <label htmlFor="file-input">File:</label>
        <input
          id="file-input"
          type="file"
          accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,audio/*"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </div>
      <p className="small">
        .txt, .pdf, .docx, an image, or an audio file — drag a file here or choose one. Scanned pages are OCR'd
        automatically; audio is transcribed automatically so you can read along and tap any word while it plays.
      </p>
      <p className="small">
        Tip: this reader works best with plain text. For the cleanest results on a scanned PDF, convert it to text
        first — try{" "}
        <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer">
          Google Drive's free OCR
        </a>{" "}
        (upload the PDF, then open it with Google Docs) for shorter documents, or{" "}
        <a href="https://www.i2ocr.com/pdf-ocr-arabic" target="_blank" rel="noopener noreferrer">
          i2OCR
        </a>{" "}
        for longer ones — then upload the resulting .txt here.
      </p>
    </fieldset>
  );
}
