import {
  Events,
  MessageFlags,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { debugLogger } from '../helper/debugLogger.js';
import { handleCommandError } from '../helper/errorHandler.js';
import { formatHrDuration } from '../helper/hrDuration.js';
import { isDuplicateEventId } from '../helper/idempotencyGuard.js';
import { commandErrors, commandsCounter, commandsPerSecond } from '../helper/metrics.js';
import {
  INTERACTION_EXEC_LOCK_TTL_MS,
  safeInteractionFollowUp,
  safeInteractionReply,
} from '../helper/safeDiscordResponse.js';
import { logCommandUsage, tryAcquireEventLock } from '../helper/usageTracker.js';
import type { Event, ExtendedClient } from '../types/index.js';

const interactionsCreate: Event = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction): Promise<void> {
    if (isDuplicateEventId(`interaction:${interaction.id}`)) {
      debugLogger.warn('INTERACTION', 'Skipping duplicate InteractionCreate event', {
        interactionId: interaction.id,
        type: interaction.type,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
      });
      return;
    }

    const interactionLockKey = `interaction:exec:${interaction.id}`;
    if (!tryAcquireEventLock(interactionLockKey, INTERACTION_EXEC_LOCK_TTL_MS)) {
      debugLogger.warn(
        'INTERACTION',
        'Skipping duplicate interaction execution (cross-process lock)',
        {
          interactionId: interaction.id,
          type: interaction.type,
          userId: interaction.user?.id,
          guildId: interaction.guildId,
          processId: process.pid,
        },
      );
      return;
    }

    debugLogger.event(Events.InteractionCreate, 'Interaction received', {
      type: interaction.type,
      id: interaction.id,
      userId: interaction.user?.id,
      guildId: interaction.guildId,
    });

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('healtroop:')) {
      debugLogger.step('INTERACTION', 'Processing healtroop select menu', {
        customId: interaction.customId,
      });
      try {
        const mod = await import('../commands/aow/healtroop.js');
        const healtroop = mod.default ?? mod;
        if ('handleSelect' in healtroop && typeof healtroop.handleSelect === 'function') {
          debugLogger.debug('INTERACTION', 'Calling healtroop.handleSelect');
          await healtroop.handleSelect(interaction as StringSelectMenuInteraction);
          debugLogger.step('INTERACTION', 'Healtroop select menu handled successfully');
        } else {
          debugLogger.warn('INTERACTION', 'Healtroop handleSelect not available');
          await safeInteractionReply(interaction, {
            content: 'Selector not available.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        debugLogger.error('INTERACTION', 'Error handling healtroop select menu', {
          error: error as Error,
          customId: interaction.customId,
        });
        await handleCommandError(interaction, error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      debugLogger.debug('INTERACTION', 'Interaction is not a chat input command, skipping', {
        type: interaction.type,
      });
      return;
    }

    const commandName = interaction.commandName;
    debugLogger.command(commandName, 'Command execution started', {
      userId: interaction.user?.id,
      username: interaction.user?.username,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      options: interaction.options.data.map((opt) => ({
        name: opt.name,
        value: opt.value,
      })),
    });

    const command = (interaction.client as ExtendedClient).commands.get(commandName);
    if (!command) {
      debugLogger.warn('INTERACTION', 'Command not found in registry', {
        commandName,
      });
      console.warn(`[EVENT:INTERACTION] Command not found: ${commandName}`);
      const fallback = {
        content: 'That command is currently unavailable. Please try again in a moment.',
        flags: MessageFlags.Ephemeral,
      } as const;
      if (interaction.replied || interaction.deferred) {
        await safeInteractionFollowUp(interaction, fallback);
      } else {
        await safeInteractionReply(interaction, fallback);
      }
      return;
    }

    const startHr = process.hrtime.bigint();
    try {
      debugLogger.step('COMMAND', 'Executing command', { commandName });
      await command.execute(interaction);
      debugLogger.command(commandName, 'Command executed successfully', {
        duration: formatHrDuration(startHr),
      });

      commandsCounter.inc();
      commandsPerSecond.mark();

      debugLogger.debug('COMMAND', 'Logging command usage', { commandName });
      logCommandUsage({
        commandName,
        userId: interaction.user?.id,
        guildId: interaction.guildId ?? undefined,
        success: true,
      });
      debugLogger.step('COMMAND', 'Command usage logged', { commandName });
    } catch (error) {
      debugLogger.error('COMMAND', 'Command execution failed', {
        commandName,
        duration: formatHrDuration(startHr),
        error: error as Error,
      });

      commandErrors.inc();
      await handleCommandError(interaction, error);
      try {
        debugLogger.debug('COMMAND', 'Logging failed command usage', {
          commandName,
        });
        logCommandUsage({
          commandName,
          userId: interaction.user?.id,
          guildId: interaction.guildId ?? undefined,
          success: false,
          errorMessage: (error as Error)?.message || String(error),
        });
      } catch (logError) {
        debugLogger.error('COMMAND', 'Failed to log command usage', {
          commandName,
          error: logError as Error,
        });
      }
    }
  },
};

export default interactionsCreate;
