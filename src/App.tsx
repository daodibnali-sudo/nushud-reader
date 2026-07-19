import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { LanguageSelect } from "./components/LanguageSelect";
import { ClickableArabicText } from "./components/ClickableArabicText";
import { WordInfoPanel } from "./components/WordInfoPanel";
import { StatusBar } from "./components/StatusBar";
import { SavedCardsPage } from "./components/SavedCardsPage";
import { NushudPromo } from "./components/NushudPromo";
import { NushudAdBanner } from "./components/NushudAdBanner";
import { getSupabaseClient } from "./lib/supabase/client";
import { extractFromFile } from "./utils/extractText";
import { buildDocumentLines } from "./utils/arabicText";
import { analyzeDocumentWords } from "./repositories/wordAnalysisService";
import { welcomeText } from "./content/welcomeText";
import type { DocumentLine, ReaderWordEntry, WordToken } from "./types";

type View = "read" | "cards";

function App() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [view, setView] = useState<View>("read");
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [fileName, setFileName] = useState("");
  const [documentLines, setDocumentLines] = useState<DocumentLine[]>(() => buildDocumentLines(welcomeText));
  const [language, setLanguage] = useState("en");
  const [resolvedWords, setResolvedWords] = useState<Record<string, ReaderWordEntry>>({});
  const [selectedToken, setSelectedToken] = useState<WordToken | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "This is a live demo — click a word below, or upload your own file to replace it.",
  );
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const runAnalysis = useCallback(async (lines: DocumentLine[], targetLanguage: string) => {
    setIsBusy(true);
    setProgress(null);

    try {
      const { failedWords } = await analyzeDocumentWords(supabase, lines, targetLanguage, {
        onProgress: (analysisProgress) => {
          setProgress({ current: analysisProgress.resolvedWords, total: analysisProgress.totalWords });
          if (analysisProgress.phase === "loading-cache") {
            setStatusMessage("Loading dictionary cache...");
          } else if (analysisProgress.phase === "analyzing") {
            setStatusMessage(
              `Analyzing word ${analysisProgress.resolvedWords} / ${analysisProgress.totalWords}...`,
            );
          } else if (analysisProgress.phase === "saving") {
            setStatusMessage("Saving newly learned words...");
          }
        },
        onWordsResolved: (entries) => {
          setResolvedWords((current) => ({ ...current, ...entries }));
        },
      });

      setStatusMessage(
        failedWords.length > 0
          ? `Done, but ${failedWords.length} word(s) could not be analyzed.`
          : "Done. Every word is ready to tap.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setIsBusy(false);
    }
  }, [supabase]);

  const hasRunInitialDemo = useRef(false);
  useEffect(() => {
    if (hasRunInitialDemo.current) return;
    hasRunInitialDemo.current = true;
    void runAnalysis(documentLines, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setIsOnboarding(false);
      setFileName(file.name);
      setDocumentLines([]);
      setResolvedWords({});
      setSelectedToken(null);
      setIsBusy(true);
      setProgress(null);
      setStatusMessage(`Reading ${file.name}...`);

      try {
        const extraction = await extractFromFile(file, (message) => setStatusMessage(message));
        const lines = buildDocumentLines(extraction.fullText);
        setDocumentLines(lines);

        if (extraction.usedOcrPageCount > 0) {
          setStatusMessage(`OCR'd ${extraction.usedOcrPageCount} page(s). Now analyzing words...`);
        }

        await runAnalysis(lines, language);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not read that file.");
        setIsBusy(false);
      }
    },
    [language, runAnalysis],
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      setLanguage(nextLanguage);
      if (documentLines.length > 0) {
        void runAnalysis(documentLines, nextLanguage);
      }
    },
    [documentLines, runAnalysis],
  );

  const selectedEntry = selectedToken ? resolvedWords[selectedToken.normalized] ?? null : null;

  return (
    <table className="page" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td className="banner">
            <img src="/logo.png" alt="NUSHUD Reader" className="site-logo" />
            <p>Read any Arabic text and click any word to see its meaning — free.</p>
          </td>
        </tr>
        <tr>
          <td className="nav">
            <button
              type="button"
              className={view === "read" ? "nav-button current" : "nav-button"}
              onClick={() => setView("read")}
            >
              Home
            </button>
            <button
              type="button"
              className={view === "cards" ? "nav-button current" : "nav-button"}
              onClick={() => setView("cards")}
            >
              My Cards
            </button>
          </td>
        </tr>
        <tr>
          <td className="content">
            {view === "cards" ? (
              <SavedCardsPage />
            ) : (
              <>
                <fieldset>
                  <legend>Settings</legend>
                  <LanguageSelect value={language} onChange={handleLanguageChange} disabled={isBusy} />
                </fieldset>
                <UploadPanel onFile={handleFile} disabled={isBusy} />

                <StatusBar message={fileName ? `${fileName} — ${statusMessage}` : statusMessage} progress={progress} />

                {documentLines.length > 0 && (
                  <>
                    <table className="two-col">
                      <tbody>
                        <tr>
                          <td>
                            <ClickableArabicText
                              lines={documentLines}
                              resolvedWords={resolvedWords}
                              selectedTokenId={selectedToken?.id ?? null}
                              onSelectToken={setSelectedToken}
                            />
                            {isOnboarding && <NushudAdBanner />}
                          </td>
                          <td className="side">
                            <div className={selectedToken ? "word-popup word-popup-open" : "word-popup"}>
                              {selectedToken && (
                                <button
                                  type="button"
                                  className="word-popup-close"
                                  onClick={() => setSelectedToken(null)}
                                  aria-label="Close"
                                  title="Close"
                                >
                                  ×
                                </button>
                              )}
                              <WordInfoPanel
                                normalizedWord={selectedToken?.normalized ?? null}
                                word={selectedToken?.raw ?? null}
                                entry={selectedEntry}
                                language={language}
                                isLoading={isBusy}
                                onSaved={() => {
                                  if (window.matchMedia("(max-width: 640px)").matches) {
                                    setSelectedToken(null);
                                  }
                                }}
                              />
                            </div>
                            <NushudPromo />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {selectedToken && (
                      <div className="word-popup-backdrop" onClick={() => setSelectedToken(null)} />
                    )}
                  </>
                )}
              </>
            )}
          </td>
        </tr>
        <tr>
          <td className="footer">
            Powered by{" "}
            <a href="https://nushud.com" target="_blank" rel="noopener noreferrer">
              NUSHUD.com
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default App;
