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
          accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </div>
      <p className="small">.txt, .pdf, .docx, or an image — drag a file here or choose one. Scanned pages are OCR'd automatically.</p>
    </fieldset>
  );
}
