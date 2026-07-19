export function NushudAdBanner() {
  return (
    <div className="ad-banner">
      <div className="ad-banner-label">Advertisement</div>
      <a href="https://nushud.com" target="_blank" rel="noopener noreferrer" className="ad-banner-link">
        <img src="/nushud-app-preview.jpeg" alt="NUSHUD app" className="ad-banner-image" />
        <div className="ad-banner-text">
          <strong>Learn Arabic through nasheeds</strong>
          <span>Clickable lyrics, dictionary, flashcards — get NUSHUD.com</span>
        </div>
      </a>
    </div>
  );
}
