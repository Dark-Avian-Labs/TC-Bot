import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Colors,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';

import {
  BOT_ICON_URL,
  TRUNCATION_LIMITS,
  COST_TYPES,
  MODIFIER_THRESHOLDS,
  COST_LABELS,
  VALIDATION,
} from '../../helper/constants.js';
import { numberWithCommas } from '../../helper/formatters.js';
import { formatHrDuration } from '../../helper/hrDuration.js';
import { safeDeferReply, safeInteractionReply } from '../../helper/safeDiscordResponse.js';
import { getSheetRowsCached } from '../../helper/sheetsCache.js';
import {
  TroopRow,
  type Command,
  type HealingCosts,
  type ExtendedClient,
} from '../../types/index.js';

interface RowCalc {
  row: TroopRow;
  calc: HealingCosts | null;
}

interface ModifierResult {
  modifier: number;
  units: number;
}

const healtroop: Command = {
  data: new SlashCommandBuilder()
    .setName('healtroop')
    .setDescription('Calculate cost to heal troops')
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('How many troops are injured').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('tier').setDescription('Tier of the injured units').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Select the unit type')
        .addChoices(
          { name: 'Infantry', value: 'Infantry' },
          { name: 'Walker', value: 'Walker' },
          { name: 'Airship', value: 'Airship' },
        )
        .setRequired(true),
    ),
  examples: [
    '/healtroop amount:100 tier:12 type:Infantry',
    '/healtroop amount:50 tier:10 type:Walker',
  ],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    const troopAmount = interaction.options.getInteger('amount');
    const troopTier = interaction.options.getInteger('tier');
    const troopType = interaction.options.getString('type');

    if (troopTier === null || troopTier < VALIDATION.MIN_TIER || troopTier > VALIDATION.MAX_TIER) {
      await safeInteractionReply(interaction, {
        content: `Tier must be between ${VALIDATION.MIN_TIER} and ${VALIDATION.MAX_TIER}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!troopAmount || !troopType) {
      await safeInteractionReply(interaction, {
        content: 'Missing required parameters',
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
      console.error('[HEALTROOP] Missing GOOGLE_SHEET_ID: cannot call getSheetRowsCached.');
      await interaction.editReply({
        content: 'Google Sheet is not configured (missing GOOGLE_SHEET_ID).',
      });
      return;
    }

    const rows = await getSheetRowsCached(googleSheets, sheetId);

    const troopRows = findTroopRows(rows, troopTier, troopType);
    if (troopRows.length === 0) {
      await interaction.editReply({ content: 'Troop data not found!' });
      return;
    }

    const validByName = buildValidByNameMap(troopRows, troopAmount);

    if (validByName.size === 0) {
      await interaction.editReply({
        content: 'No usable troop data found for that selection (rows are empty or missing costs).',
      });
      return;
    }

    if (validByName.size > 1) {
      const embed = new EmbedBuilder()
        .setColor(Colors.White)
        .setTitle('Healing cost — choose troop')
        .setDescription(
          `Found ${validByName.size} troop variants for ` +
            `T${troopTier} ${troopType}. Choose one to see detailed costs.`,
        )
        .addFields({
          name: 'Selection',
          value:
            '```asciidoc\n' +
            `${numberWithCommas(troopAmount)}x ` +
            `(T${troopTier} ${troopType})\n` +
            '```',
        })
        .setFooter({
          text: `via tc-bot - ${formatHrDuration(startHr)}`,
          iconURL: BOT_ICON_URL,
        });

      const options = Array.from(validByName.keys())
        .sort((a, b) => a.localeCompare(b))
        .slice(0, TRUNCATION_LIMITS.MAX_SELECT_OPTIONS)
        .map((name) => ({
          label: name.slice(0, 100),
          value: name.slice(0, 100),
        }));

      const truncated = validByName.size > TRUNCATION_LIMITS.MAX_SELECT_OPTIONS;

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`healtroop:${troopTier}|${troopType}|${troopAmount}|${interaction.user.id}`)
          .setPlaceholder('Pick a troop name…')
          .addOptions(options)
          .setMinValues(1)
          .setMaxValues(1),
      );

      const content = truncated
        ? `Showing first ${TRUNCATION_LIMITS.MAX_SELECT_OPTIONS} of ${validByName.size} troops.`
        : undefined;

      await interaction.editReply({
        content,
        embeds: [embed],
        components: [row],
      });
      return;
    }

    const [singleName] = Array.from(validByName.keys());
    const selectedRows = validByName.get(singleName)!.slice(0, TRUNCATION_LIMITS.MAX_ROWS);
    const perRowCalcs = selectedRows
      .map((r) => ({ row: r, calc: calculateHealingCosts(r, troopAmount) }))
      .filter((x): x is RowCalc => x.calc !== null && x.calc.hasData);

    const embed = createMultiHealingEmbed(
      troopTier,
      troopType,
      troopAmount,
      singleName,
      perRowCalcs,
      selectedRows.length < validByName.get(singleName)!.length
        ? validByName.get(singleName)!.length - selectedRows.length
        : 0,
      startHr,
    );

    await interaction.editReply({ embeds: [embed], components: [] });
  },

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    try {
      const meta = String(interaction.customId).slice('healtroop:'.length);
      const [tierStr, type, amountStr, originalUserId] = meta.split('|');
      const troopTier = parseInt(tierStr, 10);
      const troopType = type;
      const troopAmount = parseInt(amountStr, 10);
      const selectedName = interaction.values?.[0];

      if (originalUserId && interaction.user.id !== originalUserId) {
        await safeInteractionReply(interaction, {
          content: 'Only the user who ran the command can make this selection.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!Number.isFinite(troopTier) || !Number.isFinite(troopAmount) || !selectedName) {
        await interaction.update({
          content: 'Invalid selection.',
          components: [],
        });
        return;
      }

      const googleSheets = (interaction.client as ExtendedClient).GoogleSheets;
      if (!googleSheets) {
        await interaction.update({
          content: 'Google Sheets is not available.',
          components: [],
        });
        return;
      }
      const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
      if (!sheetId) {
        console.error('[HEALTROOP] Missing GOOGLE_SHEET_ID: cannot call getSheetRowsCached.');
        await interaction.update({
          content: 'Google Sheet is not configured (missing GOOGLE_SHEET_ID).',
          components: [],
        });
        return;
      }

      const rows = await getSheetRowsCached(googleSheets, sheetId);

      const troopRows = findTroopRows(rows, troopTier, troopType).filter(
        (r) => String(r.get('troopName')) === String(selectedName),
      );

      if (troopRows.length === 0) {
        await interaction.update({
          content: 'No rows found for that troop name anymore.',
          components: [],
        });
        return;
      }

      const selectedRows = troopRows.slice(0, TRUNCATION_LIMITS.MAX_ROWS);
      const perRowCalcs = selectedRows
        .map((r) => ({
          row: r,
          calc: calculateHealingCosts(r, troopAmount),
        }))
        .filter((x): x is RowCalc => x.calc !== null && x.calc.hasData);

      if (perRowCalcs.length === 0) {
        await interaction.update({
          content:
            'No usable troop data found for that selection (rows are empty or missing costs).',
          components: [],
        });
        return;
      }

      const embed = createMultiHealingEmbed(
        troopTier,
        troopType,
        troopAmount,
        selectedName,
        perRowCalcs,
        troopRows.length > TRUNCATION_LIMITS.MAX_ROWS
          ? troopRows.length - TRUNCATION_LIMITS.MAX_ROWS
          : 0,
        startHr,
      );

      await interaction.update({
        content: '',
        embeds: [embed],
        components: [],
      });
    } catch (err) {
      console.error('[EVENT:HEALTROOP] handleSelect failed:', err);
      try {
        await interaction.update({
          content: 'Failed to render selection.',
          components: [],
        });
      } catch (secondaryErr) {
        console.warn('[EVENT:HEALTROOP] Secondary update failed:', secondaryErr);
      }
    }
  },
};

function findTroopRows(rows: TroopRow[], tier: number, type: string): TroopRow[] {
  return rows.filter(
    (row) =>
      String(row.get('troopTier')) === String(tier) &&
      row.get('troopType') === type &&
      row.get('isNPC') === 'N',
  );
}

function buildValidByNameMap(rows: TroopRow[], troopAmount: number): Map<string, TroopRow[]> {
  const byName = new Map<string, TroopRow[]>();
  for (const row of rows) {
    const name = String(row.get('troopName') || '').trim();
    if (!name) continue;
    const calc = calculateHealingCosts(row, troopAmount);
    if (!calc || !calc.hasData) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(row);
  }
  return byName;
}

function getModifier(totalUnits: number): number {
  for (const threshold of MODIFIER_THRESHOLDS) {
    if (totalUnits >= threshold.units) {
      return threshold.modifier;
    }
  }
  return 0.1;
}

function getOptimalModifier(troopUnits: number): ModifierResult {
  for (let i = 0; i < MODIFIER_THRESHOLDS.length - 1; i++) {
    const current = MODIFIER_THRESHOLDS[i];
    const next = MODIFIER_THRESHOLDS[i + 1];

    if (troopUnits < current.units && troopUnits >= next.units) {
      return { modifier: current.modifier, units: current.units };
    }
  }

  if (troopUnits >= MODIFIER_THRESHOLDS[0].units) {
    return { modifier: MODIFIER_THRESHOLDS[0].modifier, units: -1 };
  }

  const lowest = MODIFIER_THRESHOLDS[MODIFIER_THRESHOLDS.length - 1];
  return { modifier: lowest.modifier, units: lowest.units };
}

function calculateResourceCost(
  costString: unknown,
  amount: number,
  modifier: number,
): number | null {
  if (costString === null || costString === undefined) return null;
  const raw = String(costString).replace(/,/g, '').trim();
  if (raw === '') return null;
  const baseCost = parseInt(raw, 10);
  if (!Number.isFinite(baseCost)) return null;
  return Math.ceil(baseCost * amount * modifier);
}

function calculateHealingCosts(troopData: TroopRow, troopAmount: number): HealingCosts | null {
  const unitsPerTroop = parseInt(String(troopData.get('troopUnits') || '0'), 10);
  if (!Number.isFinite(unitsPerTroop) || unitsPerTroop <= 0) {
    return null;
  }

  const totalUnits = troopAmount * unitsPerTroop;
  const modifier = getModifier(totalUnits);
  const optimal = getOptimalModifier(unitsPerTroop);
  const optQty = Math.max(
    1,
    optimal.units === -1 ? troopAmount : Math.floor(optimal.units / unitsPerTroop),
  );

  const costs: HealingCosts = {
    resources: {},
    special: {},
    other: {},
    totalUnits,
    modifier,
    optimal,
    optQty,
    hasData: false,
  };

  COST_TYPES.RESOURCES.forEach((type) => {
    const cost = calculateResourceCost(troopData.get(type), troopAmount, modifier);
    const optCost = calculateResourceCost(troopData.get(type), troopAmount, optimal.modifier);
    if (cost !== null) {
      costs.resources[type] = { current: cost, optimal: optCost ?? cost };
      costs.hasData = true;
    }
  });

  COST_TYPES.SPECIAL.forEach((type) => {
    const cost = calculateResourceCost(troopData.get(type), troopAmount, modifier);
    let optPerChunk = calculateResourceCost(troopData.get(type), 1, optimal.modifier);
    if (cost !== null && optPerChunk !== null) {
      if (optPerChunk < 1) optPerChunk = 1;
      const chunks = optimal.units === -1 ? 1 : Math.ceil(troopAmount / optQty);
      costs.special[type] = { current: cost, optimal: optPerChunk * chunks };
      costs.hasData = true;
    }
  });

  COST_TYPES.OTHER.forEach((type) => {
    const value = troopData.get(type);
    if (value) {
      const v = parseInt(String(value).replace(/,/g, ''), 10);
      if (Number.isFinite(v)) {
        costs.other[type] = Math.ceil(v * troopAmount);
        costs.hasData = true;
      }
    }
  });

  return costs.hasData ? costs : null;
}

function formatCostText(costs: HealingCosts, isOptimal = false): string {
  let text = '';
  const allCosts = { ...costs.resources, ...costs.special };

  Object.entries(allCosts).forEach(([type, cost]) => {
    const value = isOptimal ? cost.optimal : cost.current;
    const label = COST_LABELS[type] || `${type}::`;
    text += `\n${label.padEnd(7)} ${numberWithCommas(value)}`;
  });

  return text;
}

function formatOtherStats(costs: HealingCosts): string {
  let text = '';

  Object.entries(costs.other).forEach(([type, value]) => {
    const label = COST_LABELS[type] || `${type}::`;
    text += `\n${label.padEnd(14)} ${numberWithCommas(value)}`;
  });

  return text;
}

function createMultiHealingEmbed(
  troopTier: number,
  troopType: string,
  troopAmount: number,
  troopName: string,
  perRowCalcs: RowCalc[],
  truncatedCount: number,
  startHr: bigint,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Colors.White).setTitle('Healing cost:');

  embed.addFields({
    name: 'Selection:',
    value:
      '```asciidoc\n' +
      `${numberWithCommas(troopAmount)}x ${troopName} ` +
      `(T${troopTier} ${troopType})\n` +
      '```',
  });

  for (const item of perRowCalcs) {
    const troopData = item.row;
    const costs = item.calc;

    if (!costs) continue;

    const unitsPerTroop = troopData.get('troopUnits');
    const header =
      `${troopData.get('troopName')} — ` +
      `${numberWithCommas(troopAmount)}x @ ` +
      `${numberWithCommas(Number(unitsPerTroop))} units each`;

    const body =
      '```asciidoc\n' +
      `Total Units: ${numberWithCommas(costs.totalUnits)} ` +
      `@ ${(costs.modifier * 100).toFixed(0)}% of training costs.` +
      `${formatCostText(costs)}\n` +
      '```\n' +
      '```asciidoc\n' +
      'Other Stats:' +
      `${formatOtherStats(costs)}` +
      '```';

    let tip = '';
    if (costs.optimal.modifier < costs.modifier) {
      const tipText =
        `${costs.optQty}x troop${costs.optQty > 1 ? 's' : ''} ` +
        'at a time to heal at ' +
        `${(costs.optimal.modifier * 100).toFixed(0)}% of training costs:`;
      const warning = Object.keys(costs.special).some((t) => COST_TYPES.SPECIAL.includes(t))
        ? 'Save rss but may cost more sm/uc/hc\n'
        : '';
      tip =
        '```asciidoc\n' +
        `TIP: Heal ${tipText}\n${warning}--${formatCostText(costs, true)}\n` +
        '```';
    }

    embed.addFields({
      name: header,
      value: body + tip,
    });
  }

  if (truncatedCount > 0) {
    embed.addFields({
      name: 'Note:',
      value:
        `Showing first ${perRowCalcs.length} matches. ` + `+${truncatedCount} more rows omitted.`,
    });
  }

  embed.setFooter({
    text: `via tc-bot - ${formatHrDuration(startHr)}`,
    iconURL: BOT_ICON_URL,
  });

  return embed;
}

export default healtroop;
export { getModifier, getOptimalModifier, calculateResourceCost, calculateHealingCosts };
