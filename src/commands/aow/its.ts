import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { BOT_ICON_URL, VALIDATION } from '../../helper/constants.js';
import { numberWithCommas } from '../../helper/formatters.js';
import { formatHrDuration } from '../../helper/hrDuration.js';
import { safeDeferReply, safeInteractionReply } from '../../helper/safeDiscordResponse.js';
import { getSheetRowsCached } from '../../helper/sheetsCache.js';
import { TroopRow, type Command, type KillResult, type ExtendedClient } from '../../types/index.js';

const its: Command = {
  data: new SlashCommandBuilder()
    .setName('its')
    .setDescription('How many troops can I kill with Ignore Tier Suppression skills?')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('iTS Skill Level').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('leadership').setDescription('Leadership amount').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('tier').setDescription('Target Tier').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('tdr').setDescription('Target Total Damage Reduction amount'),
    ),
  examples: [
    '/its level:30 leadership:500000 tier:12',
    '/its level:25 leadership:300000 tier:10 tdr:20',
  ],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    const skillLevel = interaction.options.getInteger('level');
    const leadership = interaction.options.getInteger('leadership');
    const targetTier = interaction.options.getInteger('tier');
    const inputTdr = interaction.options.getInteger('tdr');
    const tdr = Math.min(100, Math.max(0, inputTdr ?? 0));

    if (!skillLevel || skillLevel < 1 || skillLevel > VALIDATION.MAX_SKILL_LEVEL) {
      await safeInteractionReply(interaction, {
        content: `You entered skill level ${skillLevel}. Was that intended? Because it's not possible, but it would be REALLY nice if it were...`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!leadership) {
      await safeInteractionReply(interaction, {
        content: 'Missing required parameters',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      targetTier === null ||
      targetTier < VALIDATION.MIN_TIER ||
      targetTier > VALIDATION.MAX_TIER
    ) {
      await safeInteractionReply(interaction, {
        content: `Tier must be between ${VALIDATION.MIN_TIER} and ${VALIDATION.MAX_TIER}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await safeDeferReply(interaction);

    const googleSheets = (interaction.client as ExtendedClient).GoogleSheets;
    if (!googleSheets) {
      await interaction.editReply({
        content: 'Google Sheets is not available.',
      });
      return;
    }
    const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (!sheetId) {
      console.error('[ITS] Missing GOOGLE_SHEET_ID: cannot call getSheetRowsCached.');
      await interaction.editReply({
        content: 'Google Sheet is not configured (missing GOOGLE_SHEET_ID).',
      });
      return;
    }

    const rows = await getSheetRowsCached(googleSheets, sheetId);

    const kills = calculateKills(rows, targetTier, skillLevel, leadership, tdr);

    if (kills.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Ignore Tier Suppression')
            .setDescription(
              'No usable troop data found (rows are empty, invalid, or would result in 0 kills).',
            )
            .setFooter({
              text: `via tc-bot - ${formatHrDuration(startHr)}`,
              iconURL: BOT_ICON_URL,
            }),
        ],
      });
      return;
    }

    const embed = createItsEmbed(leadership, skillLevel, tdr, kills, startHr);

    await interaction.editReply({ embeds: [embed] });
  },
};

function calculateKills(
  rows: TroopRow[],
  targetTier: number,
  skillLevel: number,
  leadership: number,
  tdr: number,
): KillResult[] {
  const coef = VALIDATION.ITS_DAMAGE_COEFFICIENT * leadership * skillLevel * ((100 - tdr) / 100);

  const matches = rows.filter(
    (row) => String(row.get('troopTier')) === String(targetTier) && row.get('isNPC') === 'N',
  );

  return matches
    .map((row): KillResult | null => {
      const unitsStr = row.get('troopUnits');
      const units = parseInt(String(unitsStr || '0'), 10);
      if (!Number.isFinite(units) || units <= 0) return null;

      const name = String(row.get('troopName') || '').trim();
      if (!name) return null;

      const numKills = Math.floor(coef / units);
      if (numKills <= 0) return null;

      const troopType =
        String(row.get('troopType') || '')
          .replace('Infantry', 'INF')
          .replace('Walker', 'WLK')
          .replace('Airship', 'AIR') || 'UNK';

      return {
        count: numKills,
        name,
        tier: targetTier,
        type: troopType,
      };
    })
    .filter((k): k is KillResult => k !== null)
    .sort((a, b) => b.count - a.count);
}

function formatKillsList(kills: KillResult[]): string {
  return kills
    .map((kill) => {
      const count = numberWithCommas(kill.count);
      return `- ${count}x ${kill.name} (T${kill.tier} ${kill.type})`;
    })
    .join('\n');
}

function createItsEmbed(
  leadership: number,
  skillLevel: number,
  tdr: number,
  kills: KillResult[],
  startHr: bigint,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.White)
    .setTitle('Ignore Tier Suppression')
    .addFields({
      name:
        `${numberWithCommas(leadership)} leadership with level ${skillLevel} ` +
        `iTS skill vs ${tdr}% TDR can kill:`,
      value: `\`\`\`\n${formatKillsList(kills)}\`\`\``,
    })
    .setFooter({ text: `via tc-bot - ${formatHrDuration(startHr)}`, iconURL: BOT_ICON_URL });
}

export default its;
export { calculateKills };
