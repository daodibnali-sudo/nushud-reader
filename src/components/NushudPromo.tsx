export function NushudPromo() {
  return (
    <fieldset>
      <legend>NUSHUD App</legend>
      <p style={{ textAlign: "center", margin: "0 0 8px" }}>
        <a href="https://nushud.com" target="_blank" rel="noopener noreferrer">
          <img
            src="/nushud-app-preview.jpeg"
            alt="NUSHUD app — clickable nasheed lyrics with word-by-word breakdown"
            style={{ maxWidth: "100%", height: "auto", border: "1px solid #999999" }}
          />
        </a>
      </p>
      <p className="small" style={{ textAlign: "center" }}>
        Learn Arabic through nasheeds — clickable lyrics, dictionary, flashcards.
        <br />
        <a href="https://nushud.com" target="_blank" rel="noopener noreferrer">
          Get NUSHUD →
        </a>
      </p>
    </fieldset>
  );
}
