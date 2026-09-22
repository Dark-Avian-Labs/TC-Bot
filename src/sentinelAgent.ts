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
