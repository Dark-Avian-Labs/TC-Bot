import {
  PermissionFlagsBits,
  type APIEmbed,
  type EmbedBuilder,
  type Message,
  type MessageCreateOptions,
  type PermissionsBitField,
  type RepliableInteraction,
  type TextBasedChannel,
} from 'discord.js';

import { debugLogger } from './debugLogger.js';

const REPLY_DUPLICATE_SCAN_LIMIT = 25;
const DISCORD_MISSING_ACCESS = 50001;
const DISCORD_MISSING_PERMISSIONS = 50013;
const HISTORY_SCAN_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];

export type DedupeScope =
  | { type: 'interaction'; interactionId: string }
  | { type: 'reply'; parentMessageId: string }
  | { type: 'announce'; key: string }
  | { type: 'channel'; fingerprint: string };

export function allowsHistoryScan(permissions: Pick<PermissionsBitField, 'has'>): boolean {
  return permissions.has(HISTORY_SCAN_PERMISSIONS);
}

export function interactionAllowsHistoryScan(interaction: RepliableInteraction): boolean {
  if (!interaction.inGuild()) return true;
  return allowsHistoryScan(interaction.appPermissions);
}

export async function dedupeBotResponse(sentMessage: Message, scope: DedupeScope): Promise<void> {
  try {
    const channel = await resolveTextBasedChannel(sentMessage);
    if (!channel || !channelAllowsHistoryScan(channel)) return;

    const botUserId = sentMessage.client.user?.id;
    if (!botUserId) return;

    const targetFingerprint = messageFingerprint(sentMessage);
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
    if (isMissingChannelAccess(error)) return;
    const err = error instanceof Error ? error : new Error(String(error));
    debugLogger.error('replyDuplicateCleanup', 'dedupeBotResponse failed', {
      error: err,
      channelId: sentMessage.channelId,
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
  if (!botUserId || !channelAllowsHistoryScan(channel)) return false;

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
    if (isMissingChannelAccess(error)) return false;
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

async function resolveTextBasedChannel(sentMessage: Message): Promise<TextBasedChannel | null> {
  const attached = sentMessage.channel ?? null;
  if (attached?.isTextBased()) return attached;

  try {
    const fetched = await sentMessage.client.channels.fetch(sentMessage.channelId);
    if (fetched?.isTextBased()) return fetched;
  } catch (error: unknown) {
    if (isMissingChannelAccess(error)) return null;
    const err = error instanceof Error ? error : new Error(String(error));
    debugLogger.warn('replyDuplicateCleanup', 'Failed to fetch channel for duplicate cleanup', {
      error: err,
      channelId: sentMessage.channelId,
      sentMessageId: sentMessage.id,
    });
  }

  return null;
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

function channelAllowsHistoryScan(channel: TextBasedChannel): boolean {
  if (channel.appPermissions) return allowsHistoryScan(channel.appPermissions);

  if (!('permissionsFor' in channel) || typeof channel.permissionsFor !== 'function') return true;

  const me = channel.client.user;
  if (!me) return false;

  const permissions = channel.permissionsFor(me);
  if (!permissions) return true;
  return allowsHistoryScan(permissions);
}

function isMissingChannelAccess(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === DISCORD_MISSING_ACCESS || error.code === DISCORD_MISSING_PERMISSIONS;
}

function messageFingerprint(message: Message): string {
  return JSON.stringify({
    content: message.content,
    embeds: message.embeds.map((embed) => embedDataFingerprint(embed.toJSON())),
  });
}
