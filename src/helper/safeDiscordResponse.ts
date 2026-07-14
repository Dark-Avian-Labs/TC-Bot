import {
  MessageFlags,
  Message,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  type MessageReplyOptions,
  type RepliableInteraction,
  type SendableChannels,
  type ChatInputCommandInteraction,
} from 'discord.js';

import {
  channelHasMatchingBotMessage,
  dedupeBotResponse,
  outgoingFingerprint,
  type DedupeScope,
} from './replyDuplicateCleanup.js';

const INTERACTION_EXEC_LOCK_TTL_MS = 15 * 60 * 1000;

function normalizeInteractionReplyOptions(
  options: InteractionReplyOptions | string,
): InteractionReplyOptions {
  return typeof options === 'string' ? { content: options } : options;
}

function normalizeMessageReplyOptions(options: MessageReplyOptions | string): MessageReplyOptions {
  return typeof options === 'string' ? { content: options } : options;
}

function normalizeMessageCreateOptions(
  options: MessageCreateOptions | string,
): MessageCreateOptions {
  return typeof options === 'string' ? { content: options } : options;
}

function isEphemeral(flags: unknown): boolean {
  if (typeof flags !== 'number') return false;
  return (flags & MessageFlags.Ephemeral) !== 0;
}

function interactionScope(interaction: RepliableInteraction): DedupeScope {
  return { type: 'interaction', interactionId: interaction.id };
}

function resolveInteractionMessage(
  response: Message | { resource?: { message?: Message | null } | null },
): Message | undefined {
  if (response instanceof Message) return response;
  const sent = response.resource?.message;
  return sent instanceof Message ? sent : undefined;
}

export async function safeInteractionReply(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions | string,
): Promise<Message | undefined> {
  const normalized = normalizeInteractionReplyOptions(options);
  if (isEphemeral(normalized.flags)) {
    await interaction.reply(normalized);
    return undefined;
  }

  const response = await interaction.reply({ ...normalized, withResponse: true });
  const sent = resolveInteractionMessage(response);
  if (sent) {
    await dedupeBotResponse(sent, interactionScope(interaction));
  }
  return sent;
}

export async function safeDeferReply(
  interaction: ChatInputCommandInteraction,
  options?: Parameters<ChatInputCommandInteraction['deferReply']>[0],
): Promise<void> {
  if (options && isEphemeral(options.flags)) {
    await interaction.deferReply(options);
    return;
  }

  const response = await interaction.deferReply({ ...options, withResponse: true });
  const sent = resolveInteractionMessage(response);
  if (sent) {
    await dedupeBotResponse(sent, interactionScope(interaction));
  }
}

export async function safeInteractionFollowUp(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions | string,
): Promise<Message | undefined> {
  const normalized = normalizeInteractionReplyOptions(options);
  if (isEphemeral(normalized.flags)) {
    await interaction.followUp(normalized);
    return undefined;
  }

  const response = await interaction.followUp({ ...normalized, withResponse: true });
  const sent = resolveInteractionMessage(response);
  if (sent) {
    await dedupeBotResponse(sent, interactionScope(interaction));
  }
  return sent;
}

export async function safeMessageReply(
  message: Message,
  options: MessageReplyOptions | string,
): Promise<Message> {
  const normalized = normalizeMessageReplyOptions(options);
  const sent = await message.reply(normalized);
  await dedupeBotResponse(sent, { type: 'reply', parentMessageId: message.id });
  return sent;
}

export async function safeChannelSend(
  channel: SendableChannels,
  options: MessageCreateOptions | string,
  scope?: DedupeScope,
): Promise<Message | null> {
  if (!channel.isTextBased()) return null;

  const normalized = normalizeMessageCreateOptions(options);
  const fingerprint = outgoingFingerprint(normalized);

  if (scope?.type === 'announce') {
    if (await channelHasMatchingBotMessage(channel, fingerprint, scope)) {
      return null;
    }
  }

  const sent = await channel.send(normalized);
  await dedupeBotResponse(sent, scope ?? { type: 'channel', fingerprint });
  return sent;
}

export { INTERACTION_EXEC_LOCK_TTL_MS };
