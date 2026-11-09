import { createSentinelAgent } from '@dark-avian-labs/sentinel-agent';

type AgentHandle = ReturnType<typeof createSentinelAgent>;

export function createAppSentinelAgent(options: {
  appId: string;
  displayName: string;
  nodeEnv: string;
}): AgentHandle | null {
  if (options.nodeEnv === 'test') return null;
  const token = process.env.SENTINEL_INGEST_TOKEN?.trim() ?? '';
  const ingestUrl = process.env.SENTINEL_INGEST_URL?.trim() ?? '';
  if (!token || !ingestUrl) return null;
  return createSentinelAgent({
    appId: options.appId,
    displayName: options.displayName,
    ingestUrl,
    token,
  });
}

// Same 1s budget Arsenal uses before process.exit. The agent aborts the POST at 3s.
const SENTINEL_EXIT_WAIT_MS = 1000;

export async function waitForSentinelExit(
  report: Promise<void> | undefined,
  waitMs = SENTINEL_EXIT_WAIT_MS,
): Promise<void> {
  if (!report) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      report,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
