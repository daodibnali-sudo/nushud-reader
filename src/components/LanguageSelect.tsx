import { languageOptions } from "../utils/languages";

type LanguageSelectProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

export function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <div className="form-row">
      <label htmlFor="language-select">Translate to:</label>
      <select id="language-select" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {languageOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
