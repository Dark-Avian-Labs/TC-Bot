import { Events, ChannelType, type Message } from 'discord.js';

import { ENABLE_LEGACY_MESSAGE_COMMANDS, MESSAGE_COMMAND_CHANNEL_ID } from '../helper/constants.js';
import { debugLogger } from '../helper/debugLogger.js';
import { handleMessageError } from '../helper/errorHandler.js';
import { formatHrDuration } from '../helper/hrDuration.js';
import { isDuplicateEventId } from '../helper/idempotencyGuard.js';
import { buildMopupEmbed } from '../helper/mopup.js';
import { safeMessageReply } from '../helper/safeDiscordResponse.js';
import { logCommandUsage, tryAcquireEventLock } from '../helper/usageTracker.js';
import type { Event } from '../types/index.js';

const MOPUP_MESSAGE_LOCK_TTL_MS = 10 * 60 * 1000;

function getChannelName(message: Message): string {
  if (message.channel.isDMBased()) return 'DM';
  if ('name' in message.channel) return message.channel.name;
  return 'unknown';
}

const messageCreate: Event = {
  name: Events.MessageCreate,
  async execute(message: Message): Promise<void> {
    const channelName = getChannelName(message);

    debugLogger.event(Events.MessageCreate, 'Message received', {
      messageId: message.id,
      authorId: message.author?.id,
      author: message.author?.username,
      channelId: message.channelId,
      channelName,
      isBot: message.author?.bot,
    });

    if (!shouldProcessMessage(message)) {
      debugLogger.debug('MESSAGE', 'Message filtered out (not processing)', {
        channelName,
        isBot: message.author?.bot,
      });
      return;
    }

    if (isDuplicateEventId(`message:${message.id}`)) {
      debugLogger.warn('MESSAGE', 'Skipping duplicate MessageCreate event for message command', {
        messageId: message.id,
        channelId: message.channelId,
        userId: message.author?.id,
      });
      return;
    }

    debugLogger.debug('MESSAGE', 'Message passed filter, checking for commands', {
      contentMeta: {
        length: message.content.length,
        startsWithBang: message.content.startsWith('!'),
      },
    });

    if (message.content === '!tcmu') {
      const crossProcessLockKey = `message-command:!tcmu:${message.id}`;
      const lockAcquired = tryAcquireEventLock(crossProcessLockKey, MOPUP_MESSAGE_LOCK_TTL_MS);
      if (!lockAcquired) {
        debugLogger.warn('MESSAGE', 'Skipping duplicate !tcmu execution (cross-process lock)', {
          messageId: message.id,
          channelId: message.channelId,
          userId: message.author?.id,
          processId: process.pid,
        });
        return;
      }

      debugLogger.command('msg:!tcmu', 'Message command execution started', {
        userId: message.author?.id,
        username: message.author?.username,
        guildId: message.guildId,
        channelId: message.channelId,
        processId: process.pid,
      });

      const startHr = process.hrtime.bigint();
      try {
        debugLogger.step('COMMAND', 'Building mopup embed for !tcmu');

        if (message.channel.isTextBased()) {
          debugLogger.step('COMMAND', 'Sending mopup embed response');
          await safeMessageReply(message, {
            embeds: [buildMopupEmbed(startHr)],
            allowedMentions: { repliedUser: false },
          });
          debugLogger.step('COMMAND', 'Mopup embed sent successfully');
        } else {
          debugLogger.warn('COMMAND', 'Channel does not support sending messages');
        }

        debugLogger.command('msg:!tcmu', 'Command executed successfully', {
          duration: formatHrDuration(startHr),
        });

        debugLogger.debug('COMMAND', 'Logging command usage', {
          commandName: 'msg:!tcmu',
        });
        logCommandUsage({
          commandName: 'msg:!tcmu',
          userId: message.author?.id,
          guildId: message.guildId ?? undefined,
          success: true,
        });
      } catch (error) {
        debugLogger.error('COMMAND', 'Message command execution failed', {
          commandName: 'msg:!tcmu',
          duration: formatHrDuration(startHr),
          error: error as Error,
        });

        await handleMessageError(message, error);
        try {
          logCommandUsage({
            commandName: 'msg:!tcmu',
            userId: message.author?.id,
            guildId: message.guildId ?? undefined,
            success: false,
            errorMessage: (error as Error)?.message || String(error),
          });
        } catch (logError) {
          debugLogger.error('COMMAND', 'Failed to log command usage', {
            commandName: 'msg:!tcmu',
            error: logError as Error,
          });
        }
      }
    } else {
      debugLogger.debug('MESSAGE', 'Message does not match any command pattern', {
        contentMeta: {
          length: message.content.length,
          startsWithBang: message.content.startsWith('!'),
        },
      });
    }
  },
};

function shouldProcessMessage(message: Message): boolean {
  if (!ENABLE_LEGACY_MESSAGE_COMMANDS) return false;
  if (message.channel.type !== ChannelType.GuildText) return false;
  if (!MESSAGE_COMMAND_CHANNEL_ID) return false;
  return message.channelId === MESSAGE_COMMAND_CHANNEL_ID && !message.author.bot;
}

export default messageCreate;
