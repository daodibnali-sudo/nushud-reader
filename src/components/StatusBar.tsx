type StatusBarProps = {
  message: string;
  progress?: { current: number; total: number } | null;
};

export function StatusBar({ message, progress }: StatusBarProps) {
  const percent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <div className="status-line">
      <div>
        <b>Status:</b> {message}
      </div>
      {percent !== null && progress && (
        <div className="progress-row">
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.current}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="progress-label">
            {percent}% ({progress.current}/{progress.total})
          </span>
        </div>
      )}
    </div>
  );
}
