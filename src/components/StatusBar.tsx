type StatusBarProps = {
  message: string;
  progress?: { current: number; total: number } | null;
};

const barWidth = 30;

export function StatusBar({ message, progress }: StatusBarProps) {
  const percent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <p className="status-line">
      <b>Status:</b> {message}
      {percent !== null && progress && (
        <>
          {" "}
          <span className="progress-ascii">
            [{"#".repeat(Math.round((barWidth * percent) / 100)).padEnd(barWidth, "-")}] {percent}% ({progress.current}/
            {progress.total})
          </span>
        </>
      )}
    </p>
  );
}
