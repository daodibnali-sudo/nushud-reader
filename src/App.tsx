import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { LanguageSelect } from "./components/LanguageSelect";
import { TranscriptionSettings } from "./components/TranscriptionSettings";
import { OcrSettings } from "./components/OcrSettings";
import { ExportBar } from "./components/ExportBar";
import { ClickableArabicText } from "./components/ClickableArabicText";
import { OcrPageOverlay } from "./components/OcrPageOverlay";
import { WordInfoPanel } from "./components/WordInfoPanel";
import { PhraseInfoPanel } from "./components/PhraseInfoPanel";
import { StatusBar } from "./components/StatusBar";
import { SavedCardsPage } from "./components/SavedCardsPage";
import { getSupabaseClient } from "./lib/supabase/client";
import { openDocument, type DocumentPage, type DocumentSession } from "./utils/extractText";
import { isQariAvailable, readWordWithQari } from "./utils/qari";
import { documentExportText } from "./utils/pageText";
import {
  buildDocumentFromOcrPages,
  buildDocumentLines,
  buildDocumentLinesFromTranscribedWords,
  normalizeArabicWord,
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
  getStoredOcrEngine,
  setGoogleVisionApiKey,
  setOcrEngine,
  type OcrEngine,
} from "./repositories/ocrSettings";
import { analyzeDocumentWords } from "./repositories/wordAnalysisService";
import { translateText } from "./utils/freeTranslate";
import { welcomeText } from "./content/welcomeText";
import type { DocumentLine, OcrPageResult, ReaderWordEntry, WordToken } from "./types";

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name);
}

const minReaderFontSize = 14;
const maxReaderFontSize = 40;
const readerFontSizeStep = 2;

type View = "read" | "cards";
type RunState = "idle" | "running" | "stopped" | "done";

/** Words QARI hasn't read yet carry only Tesseract's guess; never look those up. */
function withoutUnreadWords(lines: DocumentLine[]): DocumentLine[] {
  return lines.map((line) => ({ ...line, tokens: line.tokens.filter((token) => !token.needsRead) }));
}

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

  // Pages are extracted one at a time so each shows up as soon as it's done, and the visitor can
  // Stop and Resume. donePagesRef is the source of truth; the state below is for rendering.
  const sessionRef = useRef<DocumentSession | null>(null);
  const donePagesRef = useRef<DocumentPage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [donePageCount, setDonePageCount] = useState(0);
  const [runState, setRunState] = useState<RunState>("idle");
  const [qariAvailable, setQariAvailable] = useState(false);
  const [readingTokenId, setReadingTokenId] = useState<string | null>(null);

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

  useEffect(() => {
    void isQariAvailable().then((available) => {
      setQariAvailable(available);
      if (available && getStoredOcrEngine() === null) setOcrEngineState("qari-click");
      // A remembered "QARI" choice can't be honoured while the server is off.
      if (!available) setOcrEngineState((current) => (current === "qari-click" ? "free" : current));
    });
  }, []);

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

  // Looks up words in the background. Pages that arrive while a lookup is running are batched into
  // the next one, so a fast PDF doesn't download and upload the dictionary once per page.
  const pendingAnalysisLines = useRef<DocumentLine[]>([]);
  const analysisDrain = useRef<Promise<void> | null>(null);
  const failedAnalysisCount = useRef(0);

  const queueAnalysis = useCallback(
    (lines: DocumentLine[], targetLanguage: string): Promise<void> => {
      const analyzable = withoutUnreadWords(lines);
      if (analyzable.every((line) => line.tokens.length === 0)) return analysisDrain.current ?? Promise.resolve();
      pendingAnalysisLines.current.push(...analyzable);
      if (!analysisDrain.current) {
        analysisDrain.current = (async () => {
          while (pendingAnalysisLines.current.length > 0) {
            const batch = pendingAnalysisLines.current.splice(0);
            try {
              const { failedWords } = await analyzeDocumentWords(supabase, batch, targetLanguage, {
                onProgress: () => {},
                onWordsResolved: (entries) => setResolvedWords((current) => ({ ...current, ...entries })),
              });
              failedAnalysisCount.current += failedWords.length;
            } catch {
              failedAnalysisCount.current += 1;
            }
          }
          analysisDrain.current = null;
        })();
      }
      return analysisDrain.current;
    },
    [supabase],
  );

  /** Rebuilds what's on screen from the pages done so far; returns the lines of the newest page. */
  const rebuildDocument = useCallback((): DocumentLine[] => {
    const done = donePagesRef.current;
    const ocrPages: OcrPageResult[] = done.flatMap((page) => (page.ocrPage ? [page.ocrPage] : []));

    if (ocrPages.length > 0) {
      const built = buildDocumentFromOcrPages(ocrPages);
      setOcrOverlayPages(built.overlayPages);
      setDocumentLines(built.lines);
      return built.lines.slice(-1);
    }

    setOcrOverlayPages([]);
    setDocumentLines(buildDocumentLines(done.map((page) => page.text).join("\n\n")));
    return buildDocumentLines(done[done.length - 1]?.text ?? "");
  }, []);

  /** Extracts pages from the first one not done yet, so it also serves as Resume after a Stop. */
  const processPages = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const done = donePagesRef.current;
    setIsBusy(true);
    setRunState("running");

    try {
      for (let pageIndex = done.length; pageIndex < session.pageCount; pageIndex += 1) {
        if (session.pageCount > 1) setProgress({ current: pageIndex, total: session.pageCount });
        const page = await session.extractPage(
          pageIndex,
          { engine: ocrEngine, googleVisionApiKey },
          controller.signal,
          setStatusMessage,
        );
        controller.signal.throwIfAborted();
        done.push(page);
        setDonePageCount(done.length);
        void queueAnalysis(rebuildDocument(), language);
      }

      setProgress(null);
      setStatusMessage("Finishing word lookups...");
      await analysisDrain.current;
      const failedCount = failedAnalysisCount.current;
      const clickToRead = done.some((page) => page.ocrPage?.words.some((word) => word.needsRead !== undefined));
      setStatusMessage(
        failedCount > 0
          ? `Done, but ${failedCount} word(s) could not be analyzed.`
          : clickToRead
            ? "Done. Click any word and QARI reads it from the scan."
            : "Done. Every word is ready to tap.",
      );
      setRunState("done");
    } catch (error) {
      const next = `page ${done.length + 1} of ${session.pageCount}`;
      if (controller.signal.aborted) {
        setStatusMessage(`Stopped. Press Resume to continue from ${next}, or download what's done so far.`);
      } else {
        const message = error instanceof Error ? error.message : "Could not read that page.";
        setStatusMessage(`${message} Press Resume to retry from ${next}.`);
      }
      if (session.pageCount > 1) setProgress({ current: done.length, total: session.pageCount });
      setRunState("stopped");
    } finally {
      abortRef.current = null;
      setIsBusy(false);
    }
  }, [language, ocrEngine, googleVisionApiKey, queueAnalysis, rebuildDocument]);

  const stopProcessing = useCallback(() => abortRef.current?.abort(), []);

  const resetDocument = useCallback(() => {
    sessionRef.current = null;
    donePagesRef.current = [];
    failedAnalysisCount.current = 0;
    setPageCount(0);
    setDonePageCount(0);
    setRunState("idle");
  }, []);

  const handleTextFile = useCallback(
    async (file: File) => {
      resetDocument();
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
        sessionRef.current = await openDocument(file, (message) => setStatusMessage(message));
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Could not read that file.");
        setIsBusy(false);
        return;
      }

      setPageCount(sessionRef.current.pageCount);
      await processPages();
    },
    [processPages, resetDocument],
  );

  const handleAudioFile = useCallback(
    async (file: File) => {
      resetDocument();
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
    [language, runAnalysis, transcriptionEngine, elevenLabsApiKey, resetDocument],
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
        void runAnalysis(withoutUnreadWords(documentLines), nextLanguage);
      }
    },
    [documentLines, runAnalysis],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportText = useMemo(() => documentExportText(donePagesRef.current), [donePageCount, ocrOverlayPages, documentLines]);

  const selectedEntry = selectedToken ? resolvedWords[selectedToken.normalized] ?? null : null;

  const handleSelectToken = useCallback(
    async (token: WordToken) => {
      setSelectedPhrase(null);
      setSelectedToken(token);
      if (token.start !== undefined && audioRef.current) {
        audioRef.current.currentTime = token.start;
      }
      if (!token.needsRead) return;

      // QARI click-to-read: crop this word from its page scan and have QARI read it now.
      const ocrPages = donePagesRef.current.flatMap((page) => (page.ocrPage ? [page.ocrPage] : []));
      const ocrPage = ocrPages[token.lineIndex];
      const word = ocrPage?.words[token.tokenIndex];
      if (!ocrPage || !word) return;

      setReadingTokenId(token.id);
      try {
        const text = await readWordWithQari(ocrPage.imageDataUrl, word);
        ocrPage.words[token.tokenIndex] = { ...word, text, needsRead: false };
        rebuildDocument();
        const readToken: WordToken = { ...token, raw: text, normalized: normalizeArabicWord(text), needsRead: false };
        setSelectedToken((current) => (current?.id === token.id ? readToken : current));
        void queueAnalysis([{ lineIndex: token.lineIndex, tokens: [readToken] }], language);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "QARI couldn't read that word.");
      } finally {
        setReadingTokenId((current) => (current === token.id ? null : current));
      }
    },
    [language, queueAnalysis, rebuildDocument],
  );

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
                  qariAvailable={qariAvailable}
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

                {(documentLines.length > 0 || pageCount > 0) && (
                  <>
                    {pageCount > 0 && (
                      <div className="reader-toolbar">
                        <span className="run-controls">
                          {runState === "running" && pageCount > 1 && (
                            <button type="button" onClick={stopProcessing}>
                              ■ Stop
                            </button>
                          )}
                          {runState === "stopped" && donePageCount < pageCount && (
                            <button type="button" onClick={() => void processPages()}>
                              ▶ Resume from page {donePageCount + 1}
                            </button>
                          )}
                        </span>
                        <ExportBar
                          fileName={fileName}
                          text={exportText}
                          partialLabel={donePageCount < pageCount ? `${donePageCount}/${pageCount} pages` : null}
                        />
                      </div>
                    )}
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
                                  isLoading={isBusy || analysisDrain.current !== null}
                                  isReading={readingTokenId !== null && readingTokenId === selectedToken?.id}
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
