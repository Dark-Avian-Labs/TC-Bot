import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { BOT_ICON_URL } from '../../helper/constants.js';
import { formatHrDuration } from '../../helper/hrDuration.js';
import { safeInteractionReply } from '../../helper/safeDiscordResponse.js';
import type { Command, ExtendedClient } from '../../types/index.js';

const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all available commands with usage examples'),
  examples: ['/help'],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    const commands = (interaction.client as ExtendedClient).commands;

    if (!commands || commands.size === 0) {
      await safeInteractionReply(interaction, {
        content: 'No commands are currently available.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const visible = [...commands.values()].filter((cmd) => canSeeCommand(cmd, interaction));

    if (visible.length === 0) {
      await safeInteractionReply(interaction, {
        content: 'No commands available for your permissions in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const commandList = visible
      .map((cmd) => {
        let entry = `**/${cmd.data.name}** — ${cmd.data.description}`;
        if (cmd.examples && cmd.examples.length > 0) {
          entry += `\n   _Example:_ ${cmd.examples.join(' | ')}`;
        }
        return entry;
      })
      .join('\n\n');
    const maxDescriptionLength = 4000;
    const safeDescription = truncateCommandList(commandList, maxDescriptionLength);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('📜 Available Commands')
      .setDescription(safeDescription)
      .setFooter({
        text: `via tc-bot - ${formatHrDuration(startHr)}`,
        iconURL: BOT_ICON_URL,
      })
      .setTimestamp();

    await safeInteractionReply(interaction, {
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};

function truncateCommandList(commandList: string, limit: number): string {
  if (commandList.length <= limit) return commandList;

  const ellipsis = '\n…';
  const maxContentLength = Math.max(0, limit - ellipsis.length);
  const cutAt = commandList.lastIndexOf('\n\n', maxContentLength);
  const safeCut = cutAt > 0 ? cutAt : maxContentLength;
  const trimmed = commandList.slice(0, safeCut).trimEnd();

  return `${trimmed}${ellipsis}`;
}

function canSeeCommand(cmd: Command, interaction: ChatInputCommandInteraction): boolean {
  const json = typeof cmd.data?.toJSON === 'function' ? cmd.data.toJSON() : {};
  const required = (json as { default_member_permissions?: string }).default_member_permissions;

  if (!required) return true;
  if (!interaction.guild) return false;

  let requiredBits: bigint;
  try {
    requiredBits = BigInt(required);
  } catch {
    return false;
  }
  const memberPerms = interaction.memberPermissions ?? interaction.member?.permissions;
  if (!memberPerms) return false;

  if (typeof memberPerms === 'string') return false;
  return memberPerms.has(new PermissionsBitField(requiredBits));
}

export default help;
