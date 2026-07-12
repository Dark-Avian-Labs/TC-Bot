import { describe, expect, it } from 'vitest';

import { isTransientNetworkError, serializeErrorForLog } from '../src/helper/logError.js';

describe('isTransientNetworkError', () => {
  it('detects undici connect timeout errors by code', () => {
    const error = Object.assign(new Error('Connect Timeout Error (attempted address: discord.com:443)'), {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });

    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('detects connect timeout errors by name', () => {
    const error = new Error('Connect Timeout Error');
    error.name = 'ConnectTimeoutError';

    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('detects common node network error codes', () => {
    const error = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

    expect(isTransientNetworkError(error)).toBe(true);
  });

  it('does not treat unexpected errors as transient', () => {
    const error = new Error('Missing Access');

    expect(isTransientNetworkError(error)).toBe(false);
  });
});

describe('serializeErrorForLog', () => {
  it('omits stack traces for transient network errors', () => {
    const error = Object.assign(new Error('Connect Timeout Error (attempted address: discord.com:443)'), {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
    error.stack = 'ConnectTimeoutError: ...\n    at onConnectTimeout (...)';

    expect(serializeErrorForLog(error)).toEqual({
      name: 'ConnectTimeoutError',
      message: 'Connect Timeout Error (attempted address: discord.com:443)',
      code: 'UND_ERR_CONNECT_TIMEOUT',
      transient: true,
    });
  });

  it('includes stack traces for non-transient errors', () => {
    const error = new Error('Missing Access');
    error.stack = 'Error: Missing Access\n    at setName (...)';

    expect(serializeErrorForLog(error)).toEqual({
      name: 'Error',
      message: 'Missing Access',
      stack: error.stack,
    });
  });

  it('returns UnknownError shape for non-Error values', () => {
    const error = 'rate limited';

    expect(serializeErrorForLog(error)).toEqual({
      name: 'UnknownError',
      message: String(error),
    });
  });
});
