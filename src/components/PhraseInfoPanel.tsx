import { languageLabel } from "../utils/languages";

type PhraseInfoPanelProps = {
  phrase: string | null;
  translation: string | null;
  language: string;
  isLoading: boolean;
};

export function PhraseInfoPanel({ phrase, translation, language, isLoading }: PhraseInfoPanelProps) {
  if (!phrase) return null;

  return (
    <fieldset>
      <legend>Selection — {languageLabel(language)}</legend>
      <p className="arabic" dir="rtl" lang="ar">
        {phrase}
      </p>
      {isLoading ? (
        <p className="small">Translating...</p>
      ) : translation ? (
        <p>{translation}</p>
      ) : (
        <p className="small">No translation found.</p>
      )}
    </fieldset>
  );
}
