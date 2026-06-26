const TRANSIENT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_ABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const TRANSIENT_ERROR_NAMES = new Set([
  'ConnectTimeoutError',
  'HeadersTimeoutError',
  'BodyTimeoutError',
  'SocketError',
  'AbortError',
]);

interface SerializedLogError {
  name: string;
  message: string;
  code?: string;
  transient?: true;
  stack?: string;
}

function getErrorCode(error: Error): string | undefined {
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = getErrorCode(error);
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  return TRANSIENT_ERROR_NAMES.has(error.name);
}

function serializeErrorForLog(error: unknown): SerializedLogError {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: String(error) };
  }

  const code = getErrorCode(error);
  const serialized: SerializedLogError = {
    name: error.name,
    message: error.message,
  };

  if (code) {
    serialized.code = code;
  }

  if (isTransientNetworkError(error)) {
    serialized.transient = true;
    return serialized;
  }

  if (error.stack) {
    serialized.stack = error.stack;
  }

  return serialized;
}

export { isTransientNetworkError, serializeErrorForLog, type SerializedLogError };
