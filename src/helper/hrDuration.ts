export function formatHrDuration(startHr: bigint): string {
  const ms = Number(process.hrtime.bigint() - startHr) / 1e6;

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
