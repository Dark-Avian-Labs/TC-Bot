import {
  EmbedBuilder,
  SlashCommandBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js';

import {
  BOT_ICON_URL,
  GEARCHECK_LEVELS,
  GEARCHECK_MULTIPLIERS,
  VALIDATION,
} from '../../helper/constants.js';
import { numberWithCommas } from '../../helper/formatters.js';
import { formatHrDuration } from '../../helper/hrDuration.js';
import { safeDeferReply } from '../../helper/safeDiscordResponse.js';
import type { Command, GearCalculations } from '../../types/index.js';

const gearcheck: Command = {
  data: new SlashCommandBuilder()
    .setName('gearcheck')
    .setDescription('Calculate stat at base and +10/13/20/30/40/50')
    .addNumberOption((option) =>
      option.setName('stat').setDescription('Current stat amount').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Current upgrade level').setRequired(true),
    ),
  examples: ['/gearcheck stat:120 level:20', '/gearcheck stat:85.5 level:10'],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    await safeDeferReply(interaction);

    const statValue = interaction.options.getNumber('stat');
    const gearLevel = interaction.options.getInteger('level');

    if (!statValue || statValue <= 0) {
      await interaction.editReply({
        content: 'Stat value must be greater than 0',
      });
      return;
    }

    if (gearLevel === null || gearLevel < 0) {
      await interaction.editReply({
        content: 'Gear level cannot be negative',
      });
      return;
    }

    if (gearLevel > VALIDATION.MAX_GEAR_LEVEL) {
      await interaction.editReply({
        content: `Gear level ${gearLevel} is unreasonably high (max expected: ${VALIDATION.MAX_GEAR_LEVEL}).`,
      });
      return;
    }

    const calculations = calculateGearStats(statValue, gearLevel);
    const embed = createGearEmbed(statValue, gearLevel, calculations, startHr);

    await interaction.editReply({ embeds: [embed] });
  },
};

function calculateGearStats(currentStat: number, currentLevel: number): GearCalculations {
  const currentMultiplier = 1 + currentLevel / 10;
  const baseStat = currentStat / currentMultiplier;
  const len = Math.min(GEARCHECK_LEVELS.length, GEARCHECK_MULTIPLIERS.length);

  return GEARCHECK_LEVELS.slice(0, len).reduce((acc, level, index) => {
    acc[level] = (baseStat * GEARCHECK_MULTIPLIERS[index]).toFixed(2);
    return acc;
  }, {} as GearCalculations);
}

function createGearEmbed(
  currentStat: number,
  currentLevel: number,
  calculations: GearCalculations,
  startHr: bigint,
): EmbedBuilder {
  const calculatedText = Object.entries(calculations)
    .map(([level, stat]) => `+${level}:: ${numberWithCommas(stat)}%`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(Colors.White)
    .setTitle('Gearcheck')
    .addFields(
      {
        name: 'Current stat:',
        value:
          '```asciidoc\n' +
          `+${currentLevel}: ${numberWithCommas(currentStat.toFixed(2))}%` +
          '```',
      },
      {
        name: 'Calculated:',
        value: `\`\`\`asciidoc\n${calculatedText}\`\`\``,
      },
    )
    .setFooter({ text: `via tc-bot - ${formatHrDuration(startHr)}`, iconURL: BOT_ICON_URL });
}

export default gearcheck;
export { calculateGearStats };
