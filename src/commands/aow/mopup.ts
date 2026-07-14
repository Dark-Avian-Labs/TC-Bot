import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { buildMopupEmbed } from '../../helper/mopup.js';
import { safeInteractionReply } from '../../helper/safeDiscordResponse.js';
import type { Command } from '../../types/index.js';

const mopup: Command = {
  data: new SlashCommandBuilder().setName('mopup').setDescription('Time until next mopup'),
  examples: ['/mopup'],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    await safeInteractionReply(interaction, { embeds: [buildMopupEmbed(startHr)] });
  },
};

export default mopup;
