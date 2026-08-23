import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { LanguageSelect } from "./components/LanguageSelect";
import { TranscriptionSettings } from "./components/TranscriptionSettings";
import { OcrSettings } from "./components/OcrSettings";
import { ClickableArabicText } from "./components/ClickableArabicText";
import { OcrPageOverlay } from "./components/OcrPageOverlay";
import { WordInfoPanel } from "./components/WordInfoPanel";
import { PhraseInfoPanel } from "./components/PhraseInfoPanel";
import { StatusBar } from "./components/StatusBar";
import { SavedCardsPage } from "./components/SavedCardsPage";
import { getSupabaseClient } from "./lib/supabase/client";
import { extractFromFile } from "./utils/extractText";
import {
  buildDocumentFromOcrPages,
  buildDocumentLines,
  buildDocumentLinesFromTranscribedWords,
  type OcrOverlayPage,
} from "./utils/arabicText";
import { transcribeArabicAudio } from "./utils/transcribeAudio";
import { transcribeWithElevenLabs } from "./utils/transcribeElevenLabs";
import {
  getElevenLabsApiKey,
  getTranscriptionEngine,
  setElevenLabsApiKey,
  setTranscriptionEngine,
  type TranscriptionEngine,
} from "./repositories/elevenLabsSettings";
import {
  getGoogleVisionApiKey,
  getOcrEngine,
  setGoogleVisionApiKey,
  setOcrEngine,
  type OcrEngine,
} from "./repositories/ocrSettings";
import { analyzeDocumentWords } from "./repositories/wordAnalysisService";
import { translateText } from "./utils/freeTranslate";
import { welcomeText } from "./content/welcomeText";
import type { DocumentLine, ReaderWordEntry, WordToken } from "./types";

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name);
}

const minReaderFontSize = 14;
const maxReaderFontSize = 40;
const readerFontSizeStep = 2;

type View = "read" | "cards";

function App() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [view, setViewState] = useState<View>(() => (window.location.pathname === "/cards" ? "cards" : "read"));

  const setView = useCallback((nextView: View) => {
    setViewState(nextView);
    const path = nextView === "cards" ? "/cards" : "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setViewState(window.location.pathname === "/cards" ? "cards" : "read");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [fileName, setFileName] = useState("");
  const [documentLines, setDocumentLines] = useState<DocumentLine[]>(() => buildDocumentLines(welcomeText));
  const [language, setLanguage] = useState("en");
  const [resolvedWords, setResolvedWords] = useState<Record<string, ReaderWordEntry>>({});
  const [selectedToken, setSelectedToken] = useState<WordToken | null>(null);
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null);
  const [phraseTranslation, setPhraseTranslation] = useState<string | null>(null);
  const [isPhraseLoading, setIsPhraseLoading] = useState(false);
  const [isFullDisplay, setIsFullDisplay] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState<number | null>(null);

  const adjustReaderFontSize = useCallback((delta: number) => {
    setReaderFontSize((current) => {
      const base = current ?? (window.matchMedia("(max-width: 640px)").matches ? 23 : 19);
      return Math.min(maxReaderFontSize, Math.max(minReaderFontSize, base + delta));
    });
  }, []);

  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "This is a live demo — click a word below, or upload your own file to replace it.",
  );
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [ocrOverlayPages, setOcrOverlayPages] = useState<OcrOverlayPage[]>([]);

  const [transcriptionEngine, setTranscriptionEngineState] = useState<TranscriptionEngine>(getTranscriptionEngine);
  const [elevenLabsApiKey, setElevenLabsApiKeyState] = useState<string>(getElevenLabsApiKey);

  const handleEngineChange = useCallback((engine: TranscriptionEngine) => {
    setTranscriptionEngineState(engine);
    setTranscriptionEngine(engine);
  }, []);

  const handleApiKeyChange = useCallback((apiKey: string) => {
    setElevenLabsApiKeyState(apiKey);
    setElevenLabsApiKey(apiKey);
  }, []);

  const [ocrEngine, setOcrEngineState] = useState<OcrEngine>(getOcrEngine);
  const [googleVisionApiKey, setGoogleVisionApiKeyState] = useState<string>(getGoogleVisionApiKey);

  const handleOcrEngineChange = useCallback((engine: OcrEngine) => {
    setOcrEngineState(engine);
    setOcrEngine(engine);
  }, []);

  const handleGoogleVisionApiKeyChange = useCallback((apiKey: string) => {
    setGoogleVisionApiKeyState(apiKey);
    setGoogleVisionApiKey(apiKey);
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

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

  const handleTextFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setDocumentLines([]);
      setResolvedWords({});
      setSelectedToken(null);
      setActiveTokenId(null);
      setAudioUrl(null);
      setOcrOverlayPages([]);
      setIsBusy(true);
      setProgress(null);
      setStatusMessage(`Reading ${file.name}...`);

      try {
        const extraction = await extractFromFile(file, (message) => setStatusMessage(message), {
          engine: ocrEngine,
          googleVisionApiKey,
        });

        let lines: DocumentLine[];
        if (extraction.ocrPages.length > 0) {
          const built = buildDocumentFromOcrPages(extraction.ocrPages);
          lines = built.lines;
          setOcrOverlayPages(built.overlayPages);
        } else {
          lines = buildDocumentLines(extraction.fullText);
        }
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
    [language, runAnalysis, ocrEngine, googleVisionApiKey],
  );

  const handleAudioFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setDocumentLines([]);
      setResolvedWords({});
      setSelectedToken(null);
      setActiveTokenId(null);
      setAudioUrl(URL.createObjectURL(file));
      setOcrOverlayPages([]);
      setIsBusy(true);
      setProgress(null);
      setStatusMessage(`Reading ${file.name}...`);

      try {
        let words;
        if (transcriptionEngine === "elevenlabs") {
          const apiKey = elevenLabsApiKey.trim();
          if (!apiKey) {
            throw new Error("Paste your ElevenLabs API key in Settings first, or switch the engine back to Free.");
          }
          setStatusMessage("Transcribing audio via ElevenLabs...");
          ({ words } = await transcribeWithElevenLabs(file, apiKey));
        } else {
          ({ words } = await transcribeArabicAudio(file, (message) => setStatusMessage(message)));
        }

        const lines = buildDocumentLinesFromTranscribedWords(words);
        setDocumentLines(lines);
        setStatusMessage("Transcribed. Now analyzing words...");
        await runAnalysis(lines, language);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not transcribe that audio.");
        setIsBusy(false);
      }
    },
    [language, runAnalysis, transcriptionEngine, elevenLabsApiKey],
  );

  const handleFile = useCallback(
    (file: File) => {
      void (isAudioFile(file) ? handleAudioFile(file) : handleTextFile(file));
    },
    [handleAudioFile, handleTextFile],
  );

  const handleAudioTimeUpdate = useCallback(() => {
    const currentTime = audioRef.current?.currentTime;
    if (currentTime === undefined) return;

    let found: string | null = null;
    outer: for (const line of documentLines) {
      for (const token of line.tokens) {
        if (token.start === undefined || token.end === undefined) continue;
        if (currentTime >= token.start && currentTime < token.end) {
          found = token.id;
          break outer;
        }
      }
    }
    setActiveTokenId(found);
  }, [documentLines]);

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

  const handleSelectToken = useCallback((token: WordToken) => {
    setSelectedPhrase(null);
    setSelectedToken(token);
    if (token.start !== undefined && audioRef.current) {
      audioRef.current.currentTime = token.start;
    }
  }, []);

  const handleSelectPhrase = useCallback(
    (text: string) => {
      setSelectedToken(null);
      setSelectedPhrase(text);
      setPhraseTranslation(null);
      setIsPhraseLoading(true);

      translateText(text, language)
        .then((result) => setPhraseTranslation(result))
        .catch(() => setPhraseTranslation(null))
        .finally(() => setIsPhraseLoading(false));
    },
    [language],
  );

  const closePopup = useCallback(() => {
    setSelectedToken(null);
    setSelectedPhrase(null);
  }, []);

  return (
    <table className="page" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td className="banner">
            <img src="/logo.png" alt="Arabic Word By Word" className="site-logo" />
            <p>Read Arabic text word by word — click any word for an instant translation, free.</p>
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
            <a href="/about" className="nav-button">About</a>
            <a href="/how-it-works" className="nav-button">How It Works</a>
            <a href="/faq" className="nav-button">FAQ</a>
            <a
              href="https://buy.stripe.com/9B63cufAI6OcgEq7IJ8ww00"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-button"
            >
              ♥ Support this project
            </a>
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
                <OcrSettings
                  engine={ocrEngine}
                  apiKey={googleVisionApiKey}
                  onEngineChange={handleOcrEngineChange}
                  onApiKeyChange={handleGoogleVisionApiKeyChange}
                  disabled={isBusy}
                />
                <TranscriptionSettings
                  engine={transcriptionEngine}
                  apiKey={elevenLabsApiKey}
                  onEngineChange={handleEngineChange}
                  onApiKeyChange={handleApiKeyChange}
                  disabled={isBusy}
                />
                <UploadPanel onFile={handleFile} disabled={isBusy} />

                <StatusBar message={fileName ? `${fileName} — ${statusMessage}` : statusMessage} progress={progress} />

                {documentLines.length > 0 && (
                  <>
                    <div
                      className={isFullDisplay ? "reader-full-display active" : "reader-full-display"}
                      style={
                        readerFontSize !== null
                          ? ({ "--reader-font-size": `${readerFontSize}px` } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <div className="reader-focus-bar">
                        <button
                          type="button"
                          className="full-display-toggle"
                          onClick={() => setIsFullDisplay((current) => !current)}
                          aria-label="Full display read"
                          title="Full display read"
                        >
                          {isFullDisplay ? "✕ Exit full display" : "⛶ Full display read"}
                        </button>
                        {isFullDisplay && (
                          <div className="reader-font-controls">
                            <button
                              type="button"
                              onClick={() => adjustReaderFontSize(-readerFontSizeStep)}
                              disabled={readerFontSize !== null && readerFontSize <= minReaderFontSize}
                              aria-label="Decrease text size"
                              title="Decrease text size"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => adjustReaderFontSize(readerFontSizeStep)}
                              disabled={readerFontSize !== null && readerFontSize >= maxReaderFontSize}
                              aria-label="Increase text size"
                              title="Increase text size"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                      <table className="two-col">
                      <tbody>
                        <tr>
                          <td>
                            {audioUrl && (
                              <audio
                                ref={audioRef}
                                className="audio-player"
                                src={audioUrl}
                                controls
                                onTimeUpdate={handleAudioTimeUpdate}
                              />
                            )}
                            {ocrOverlayPages.length > 0 ? (
                              ocrOverlayPages.map((page, pageIndex) => (
                                <OcrPageOverlay
                                  key={pageIndex}
                                  imageDataUrl={page.imageDataUrl}
                                  words={page.words}
                                  resolvedWords={resolvedWords}
                                  selectedTokenId={selectedToken?.id ?? null}
                                  onSelectToken={handleSelectToken}
                                />
                              ))
                            ) : (
                              <ClickableArabicText
                                lines={documentLines}
                                resolvedWords={resolvedWords}
                                selectedTokenId={selectedToken?.id ?? null}
                                activeTokenId={activeTokenId}
                                onSelectToken={handleSelectToken}
                                onSelectPhrase={handleSelectPhrase}
                              />
                            )}
                            <a href="https://nushud.com" target="_blank" rel="noopener noreferrer" className="inline-promo">
                              <img src="/nushud-app-preview.jpeg" alt="NUSHUD app" className="inline-promo-image" />
                              <span>Also try NUSHUD — learn Arabic through nasheeds</span>
                            </a>
                          </td>
                          <td className="side">
                            <div className={selectedToken || selectedPhrase ? "word-popup word-popup-open" : "word-popup"}>
                              {(selectedToken || selectedPhrase) && (
                                <button
                                  type="button"
                                  className="word-popup-close"
                                  onClick={closePopup}
                                  aria-label="Close"
                                  title="Close"
                                >
                                  ×
                                </button>
                              )}
                              {selectedPhrase ? (
                                <PhraseInfoPanel
                                  phrase={selectedPhrase}
                                  translation={phraseTranslation}
                                  language={language}
                                  isLoading={isPhraseLoading}
                                />
                              ) : (
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
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                      </table>
                    </div>
                    {(selectedToken || selectedPhrase) && (
                      <div className="word-popup-backdrop" onClick={closePopup} />
                    )}
                  </>
                )}
              </>
            )}
          </td>
        </tr>
        <tr>
          <td className="footer">
            © 2026 ArabicWordByWord. All rights reserved. ·{" "}
            <a href="https://buy.stripe.com/9B63cufAI6OcgEq7IJ8ww00" target="_blank" rel="noopener noreferrer">
              Support this project
            </a>{" "}
            · <a href="mailto:daodibnali@gmail.com">Contact</a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default App;
