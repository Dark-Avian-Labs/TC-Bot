import type {
  APIEmbed,
  EmbedBuilder,
  Message,
  MessageCreateOptions,
  TextBasedChannel,
} from 'discord.js';

import { debugLogger } from './debugLogger.js';

const REPLY_DUPLICATE_SCAN_LIMIT = 25;

export type DedupeScope =
  | { type: 'interaction'; interactionId: string }
  | { type: 'reply'; parentMessageId: string }
  | { type: 'announce'; key: string }
  | { type: 'channel'; fingerprint: string };

export async function dedupeBotResponse(sentMessage: Message, scope: DedupeScope): Promise<void> {
  const channel = sentMessage.channel;
  if (!channel.isTextBased()) return;

  const botUserId = sentMessage.client.user?.id;
  if (!botUserId) return;

  const targetFingerprint = messageFingerprint(sentMessage);

  try {
    const recentMessages = await channel.messages.fetch({
      limit: REPLY_DUPLICATE_SCAN_LIMIT,
    });
    const matchingMessages = [...recentMessages.values()].filter((candidate) => {
      if (candidate.author.id !== botUserId) return false;
      if (messageFingerprint(candidate) !== targetFingerprint) return false;
      return messageMatchesScope(candidate, scope);
    });

    if (matchingMessages.length <= 1) return;

    await deleteDuplicateMessages(matchingMessages, sentMessage.id);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    debugLogger.error('replyDuplicateCleanup', 'dedupeBotResponse failed', {
      error: err,
      channelId: channel.id,
      sentMessageId: sentMessage.id,
      scope,
    });
  }
}

export async function channelHasMatchingBotMessage(
  channel: TextBasedChannel,
  fingerprint: string,
  scope: DedupeScope,
): Promise<boolean> {
  const botUserId = channel.client.user?.id;
  if (!botUserId) return false;

  try {
    const recentMessages = await channel.messages.fetch({
      limit: REPLY_DUPLICATE_SCAN_LIMIT,
    });
    return [...recentMessages.values()].some((candidate) => {
      if (candidate.author.id !== botUserId) return false;
      if (messageFingerprint(candidate) !== fingerprint) return false;
      return messageMatchesScope(candidate, scope);
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    debugLogger.error('replyDuplicateCleanup', 'channelHasMatchingBotMessage failed', {
      error: err,
      channelId: channel.id,
      scope,
    });
    return false;
  }
}

export function embedFingerprint(embed: EmbedBuilder): string {
  return JSON.stringify({ embeds: [embedDataFingerprint(embed.toJSON())] });
}

export function outgoingFingerprint(options: string | MessageCreateOptions): string {
  if (typeof options === 'string') {
    return JSON.stringify({ content: options, embeds: [] });
  }

  const embeds = options.embeds ?? [];
  return JSON.stringify({
    content: options.content ?? '',
    embeds: embeds.map((embed) =>
      embed instanceof Object && 'toJSON' in embed
        ? embedDataFingerprint((embed as EmbedBuilder).toJSON())
        : embedDataFingerprint(embed as APIEmbed),
    ),
  });
}

export function messageMatchesScope(message: Message, scope: DedupeScope): boolean {
  switch (scope.type) {
    case 'interaction':
      return message.interaction?.id === scope.interactionId;
    case 'reply':
      return message.reference?.messageId === scope.parentMessageId;
    case 'announce':
      return !message.interaction && !message.reference?.messageId;
    case 'channel':
      return !message.interaction && !message.reference?.messageId;
  }
}

async function deleteDuplicateMessages(
  matchingMessages: Message[],
  sentMessageId: string,
): Promise<void> {
  const sortedByTime = matchingMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const keepMessage =
    sortedByTime.find((candidate) => candidate.id === sentMessageId) ?? sortedByTime[0];
  const duplicatesToDelete = sortedByTime.filter((candidate) => candidate.id !== keepMessage.id);

  await Promise.allSettled(duplicatesToDelete.map((candidate) => candidate.delete()));
}

function embedDataFingerprint(data: APIEmbed): Record<string, unknown> {
  return {
    title: data.title,
    description: data.description,
    url: data.url,
    color: data.color,
    fields: data.fields?.map((field) => ({
      name: field.name,
      value: field.value,
      inline: field.inline,
    })),
  };
}

function messageFingerprint(message: Message): string {
  return JSON.stringify({
    content: message.content,
    embeds: message.embeds.map((embed) => embedDataFingerprint(embed.toJSON())),
  });
}
