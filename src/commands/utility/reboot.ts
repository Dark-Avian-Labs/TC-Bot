import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { safeInteractionReply } from '../../helper/safeDiscordResponse.js';
import type { Command } from '../../types/index.js';

const reboot: Command = {
  data: new SlashCommandBuilder()
    .setName('reboot')
    .setDescription('Shuts down the bot. PM2 will restart the container automatically.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) =>
      option
        .setName('confirm')
        .setDescription('Confirm you want to reboot the bot')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await safeInteractionReply(interaction, {
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.guildId !== process.env.GUILD_ID) {
      await safeInteractionReply(interaction, {
        content: 'Permission denied. Command used on wrong server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const confirm = interaction.options.getBoolean('confirm');
    if (!confirm) {
      await safeInteractionReply(interaction, {
        content: 'Reboot cancelled. You must confirm by setting `confirm:true`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await safeInteractionReply(interaction, {
      content: 'Bot is shutting down...',
      flags: MessageFlags.Ephemeral,
    });

    console.log(`[REBOOT] Command issued by ${interaction.user.tag} in ${interaction.guild.name}`);

    setTimeout(() => process.emit('SIGTERM'), 500);
  },
};

export default reboot;
