import type { OcrEngine } from "../repositories/ocrSettings";

type OcrSettingsProps = {
  engine: OcrEngine;
  apiKey: string;
  onEngineChange: (engine: OcrEngine) => void;
  onApiKeyChange: (apiKey: string) => void;
  disabled: boolean;
  /** QARI-OCR server is reachable (offered only then, so a visitor never picks a dead engine). */
  qariAvailable: boolean;
};

export function OcrSettings({ engine, apiKey, onEngineChange, onApiKeyChange, disabled, qariAvailable }: OcrSettingsProps) {
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
          {qariAvailable && <option value="qari-click">QARI-OCR on click (best harakat, reads each word you click)</option>}
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
          : engine === "qari-click"
            ? "Pages appear right away with a box on every word. Click a word and the QARI-OCR model reads just that word from the scan (a few seconds each) — free, and much better on harakat. Only the clicked word's picture is sent to our QARI server; it isn't stored."
            : "Uses Tesseract.js running locally in your browser — free, but weaker than Google's OCR, especially on harakat/diacritics."}
      </p>
    </fieldset>
  );
}
