import { MessageFlags, type Message, type RepliableInteraction } from 'discord.js';

import {
  safeInteractionFollowUp,
  safeInteractionReply,
  safeMessageReply,
} from './safeDiscordResponse.js';

async function handleCommandError(
  interaction: RepliableInteraction,
  error: unknown,
): Promise<void> {
  console.error('[ERROR] Command execution failed:', error);

  const errorMessage = {
    content: 'There was an error while executing this command!',
    flags: MessageFlags.Ephemeral,
  } as const;

  try {
    if (interaction.replied || interaction.deferred) {
      await safeInteractionFollowUp(interaction, errorMessage);
    } else {
      await safeInteractionReply(interaction, errorMessage);
    }
  } catch (followUpError) {
    console.error('[ERROR] Failed to send error message:', followUpError);
  }
}

async function handleMessageError(message: Message, error: unknown): Promise<void> {
  console.error('[ERROR] Message command execution failed:', error);

  try {
    await safeMessageReply(message, 'There was an error while executing this command!');
  } catch (replyError) {
    console.error('[ERROR] Failed to send error message:', replyError);
  }
}

export { handleCommandError, handleMessageError };
