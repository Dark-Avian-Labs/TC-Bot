import { describe, expect, it } from 'vitest';

import { messageMatchesScope } from '../src/helper/replyDuplicateCleanup.js';

describe('messageMatchesScope', () => {
  it('scopes interaction replies by interaction id', () => {
    const message = {
      interaction: { id: 'interaction-1' },
      reference: null,
    };

    expect(messageMatchesScope(message as never, { type: 'interaction', interactionId: 'interaction-1' })).toBe(true);
    expect(messageMatchesScope(message as never, { type: 'interaction', interactionId: 'interaction-2' })).toBe(false);
  });

  it('scopes message replies by parent message id', () => {
    const message = {
      interaction: null,
      reference: { messageId: 'parent-1' },
    };

    expect(messageMatchesScope(message as never, { type: 'reply', parentMessageId: 'parent-1' })).toBe(true);
    expect(messageMatchesScope(message as never, { type: 'reply', parentMessageId: 'parent-2' })).toBe(false);
  });

  it('scopes channel announcements to non-interaction, non-reply messages', () => {
    const announcement = { interaction: null, reference: null };
    const slashReply = { interaction: { id: 'interaction-1' }, reference: null };

    expect(messageMatchesScope(announcement as never, { type: 'announce', key: 'mopup' })).toBe(true);
    expect(messageMatchesScope(slashReply as never, { type: 'announce', key: 'mopup' })).toBe(false);
  });
});
