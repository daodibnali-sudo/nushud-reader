import type { TranscriptionEngine } from "../repositories/elevenLabsSettings";

type TranscriptionSettingsProps = {
  engine: TranscriptionEngine;
  apiKey: string;
  onEngineChange: (engine: TranscriptionEngine) => void;
  onApiKeyChange: (apiKey: string) => void;
  disabled: boolean;
};

export function TranscriptionSettings({
  engine,
  apiKey,
  onEngineChange,
  onApiKeyChange,
  disabled,
}: TranscriptionSettingsProps) {
  return (
    <fieldset>
      <legend>Audio transcription</legend>
      <div className="form-row">
        <label htmlFor="transcription-engine">Engine:</label>
        <select
          id="transcription-engine"
          value={engine}
          disabled={disabled}
          onChange={(event) => onEngineChange(event.target.value as TranscriptionEngine)}
        >
          <option value="free">Free (runs in your browser, lower quality)</option>
          <option value="elevenlabs">ElevenLabs (your own API key, higher quality, you pay ElevenLabs directly)</option>
        </select>
      </div>
      {engine === "elevenlabs" && (
        <div className="form-row">
          <label htmlFor="elevenlabs-key">API key:</label>
          <input
            id="elevenlabs-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your ElevenLabs API key"
            value={apiKey}
            disabled={disabled}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
        </div>
      )}
      <p className="small">
        {engine === "elevenlabs"
          ? "Your key is stored only in this browser and sent directly to ElevenLabs — never to this site's server. You're billed by ElevenLabs on your own account, at their normal rate; this site takes no cut and never sees your key."
          : "Uses Whisper running locally in your browser — free, but lower quality than ElevenLabs, especially on recitation/nasheeds."}
      </p>
    </fieldset>
  );
}
