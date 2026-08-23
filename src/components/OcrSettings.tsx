import type { OcrEngine } from "../repositories/ocrSettings";

type OcrSettingsProps = {
  engine: OcrEngine;
  apiKey: string;
  onEngineChange: (engine: OcrEngine) => void;
  onApiKeyChange: (apiKey: string) => void;
  disabled: boolean;
};

export function OcrSettings({ engine, apiKey, onEngineChange, onApiKeyChange, disabled }: OcrSettingsProps) {
  return (
    <fieldset>
      <legend>Scanned page / image OCR</legend>
      <div className="form-row">
        <label htmlFor="ocr-engine">Engine:</label>
        <select
          id="ocr-engine"
          value={engine}
          disabled={disabled}
          onChange={(event) => onEngineChange(event.target.value as OcrEngine)}
        >
          <option value="free">Free (runs in your browser, lower quality)</option>
          <option value="google-vision">Google Cloud Vision (your own API key, higher quality, you pay Google directly)</option>
        </select>
      </div>
      {engine === "google-vision" && (
        <div className="form-row">
          <label htmlFor="google-vision-key">API key:</label>
          <input
            id="google-vision-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your Google Cloud Vision API key"
            value={apiKey}
            disabled={disabled}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
        </div>
      )}
      <p className="small">
        {engine === "google-vision"
          ? "Your key is stored only in this browser and sent directly to Google — never to this site's server. You're billed by Google on your own account, at their normal rate; this site takes no cut and never sees your key."
          : "Uses Tesseract.js running locally in your browser — free, but weaker than Google's OCR, especially on harakat/diacritics."}
      </p>
    </fieldset>
  );
}
