import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { debugLogger } from '../src/helper/debugLogger.js';
import {
  allowsHistoryScan,
  dedupeBotResponse,
  interactionAllowsHistoryScan,
  messageMatchesScope,
} from '../src/helper/replyDuplicateCleanup.js';

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

describe('allowsHistoryScan', () => {
  it('requires view channel and read message history', () => {
    expect(
      allowsHistoryScan(
        new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]),
      ),
    ).toBe(true);
    expect(allowsHistoryScan(new PermissionsBitField(PermissionFlagsBits.ViewChannel))).toBe(false);
    expect(allowsHistoryScan(new PermissionsBitField(PermissionFlagsBits.Administrator))).toBe(true);
  });

  it('treats a direct message as scannable and a guild without access as not', () => {
    expect(interactionAllowsHistoryScan({ inGuild: () => false } as never)).toBe(true);
    expect(
      interactionAllowsHistoryScan({
        inGuild: () => true,
        appPermissions: new PermissionsBitField(),
      } as never),
    ).toBe(false);
  });
});

describe('dedupeBotResponse', () => {
  it('skips cleanup when channel fetch fails', async () => {
    const warn = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    const fetchChannel = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('Unknown Channel'));
    const sentMessage = {
      id: 'msg-1',
      channel: null,
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
        channels: { fetch: fetchChannel },
      },
    };

    await expect(
      dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' }),
    ).resolves.toBeUndefined();
    expect(fetchChannel).toHaveBeenCalledWith('channel-1');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('does not warn when the channel fetch is missing access', async () => {
    const warn = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    const denied = Object.assign(new Error('Missing Access'), { code: 50001 });
    const fetchChannel = vi.fn<() => Promise<unknown>>().mockRejectedValue(denied);
    const sentMessage = {
      id: 'msg-1',
      channel: null,
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
        channels: { fetch: fetchChannel },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchChannel).toHaveBeenCalledWith('channel-1');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not read history when the bot cannot view that history', async () => {
    const fetchMessages = vi.fn<() => Promise<Map<string, unknown>>>();
    const sentMessage = {
      id: 'msg-1',
      content: '',
      embeds: [],
      channel: {
        isTextBased: () => true,
        appPermissions: new PermissionsBitField(PermissionFlagsBits.ViewChannel),
        messages: { fetch: fetchMessages },
        client: { user: { id: 'bot-1' } },
      },
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it('reads history when channel permissions allow it', async () => {
    const fetchMessages = vi.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map());
    const sentMessage = {
      id: 'msg-1',
      content: '',
      embeds: [],
      channel: {
        isTextBased: () => true,
        appPermissions: null,
        permissionsFor: () =>
          new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]),
        messages: { fetch: fetchMessages },
        client: { user: { id: 'bot-1' } },
      },
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchMessages).toHaveBeenCalledOnce();
  });

  it('does not log when history fetch is denied', async () => {
    const errorSpy = vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    const denied = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    const fetchMessages = vi.fn<() => Promise<Map<string, unknown>>>().mockRejectedValue(denied);
    const sentMessage = {
      id: 'msg-1',
      content: '',
      embeds: [],
      channel: {
        isTextBased: () => true,
        messages: { fetch: fetchMessages },
      },
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchMessages).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fetches the channel when the message channel is missing', async () => {
    const fetchMessages = vi.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map());
    const fetchChannel = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'channel-1',
      isTextBased: () => true,
      messages: { fetch: fetchMessages },
    });
    const sentMessage = {
      id: 'msg-1',
      content: '',
      embeds: [],
      channel: null,
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
        channels: { fetch: fetchChannel },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchChannel).toHaveBeenCalledWith('channel-1');
    expect(fetchMessages).toHaveBeenCalledOnce();
  });

  it('does not fetch when the message already has a text channel', async () => {
    const fetchMessages = vi.fn<() => Promise<Map<string, unknown>>>().mockResolvedValue(new Map());
    const fetchChannel = vi.fn<() => Promise<unknown>>();
    const sentMessage = {
      id: 'msg-1',
      content: '',
      embeds: [],
      channel: {
        id: 'channel-1',
        isTextBased: () => true,
        messages: { fetch: fetchMessages },
      },
      channelId: 'channel-1',
      client: {
        user: { id: 'bot-1' },
        channels: { fetch: fetchChannel },
      },
    };

    await dedupeBotResponse(sentMessage as never, { type: 'interaction', interactionId: 'i-1' });

    expect(fetchChannel).not.toHaveBeenCalled();
    expect(fetchMessages).toHaveBeenCalledOnce();
  });
});
