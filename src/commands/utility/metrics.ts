import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { BOT_ICON_URL, METRICS_TOP_LIMIT } from '../../helper/constants.js';
import { numberWithCommas } from '../../helper/formatters.js';
import { formatHrDuration } from '../../helper/hrDuration.js';
import { getMetricsTotals, getTopCommands } from '../../helper/usageTracker.js';
import type { Command } from '../../types/index.js';

interface PeriodInfo {
  sinceUTC: string;
  label: string;
}

const METRICS_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type MetricsPeriod = (typeof METRICS_PERIODS)[number];

function isMetricsPeriod(value: string): value is MetricsPeriod {
  return (METRICS_PERIODS as readonly string[]).includes(value);
}

function resolveMetricsPeriod(raw: string | null): MetricsPeriod | null {
  if (raw === null || raw === undefined || raw === '') return 'daily';
  return isMetricsPeriod(raw) ? raw : null;
}

function daysInUTCMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function subtractOneUTCMonth(date: Date): void {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const prevMonth = m === 0 ? 11 : m - 1;
  const prevYear = m === 0 ? y - 1 : y;
  const dim = daysInUTCMonth(prevYear, prevMonth);
  date.setUTCFullYear(prevYear, prevMonth, Math.min(d, dim));
}

const metrics: Command = {
  data: new SlashCommandBuilder()
    .setName('metrics')
    .setDescription('Show command usage metrics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('Timeframe')
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Monthly', value: 'monthly' },
          { name: 'Yearly', value: 'yearly' },
        ),
    ),
  examples: ['/metrics', '/metrics period:weekly'],

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const startHr = process.hrtime.bigint();
    await interaction.deferReply();

    const period = resolveMetricsPeriod(interaction.options.getString('period'));
    if (period === null) {
      await interaction.editReply(
        'Invalid timeframe. Use Daily, Weekly, Monthly, or Yearly. If this keeps happening, contact a server administrator.',
      );
      return;
    }

    const { sinceUTC, label } = getSince(period);

    try {
      const totals = getMetricsTotals(sinceUTC);
      const top = getTopCommands(sinceUTC, METRICS_TOP_LIMIT);

      const totalCount = totals.total_count;
      const successCount = totals.success_count;
      const failureCount = totals.failure_count;
      const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';

      const topLines =
        top.length > 0
          ? top
              .map(
                (r, i) =>
                  `${String(i + 1).padStart(2, '0')}. ${r.command_name} — ${numberWithCommas(
                    r.cnt,
                  )}`,
              )
              .join('\n')
          : 'No data yet.';

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Command Metrics')
        .setDescription(`Timeframe: ${label}`)
        .addFields(
          {
            name: 'Totals',
            value:
              `Total: ${numberWithCommas(totalCount)}\n` +
              `Success: ${numberWithCommas(successCount)}\n` +
              `Failed: ${numberWithCommas(failureCount)}\n` +
              `Success rate: ${successRate}%`,
            inline: true,
          },
          {
            name: `Top ${METRICS_TOP_LIMIT} Commands`,
            value: topLines,
            inline: false,
          },
        )
        .setFooter({
          text: `via tc-bot - ${formatHrDuration(startHr)}`,
          iconURL: BOT_ICON_URL,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[METRICS] Failed to query metrics:', err);
      await interaction.editReply(
        'Metrics are temporarily unavailable. Please try again later. If the problem persists, contact a server administrator.',
      );
    }
  },
};

function getSince(period: MetricsPeriod): PeriodInfo {
  const now = new Date();
  const since = new Date(now.getTime());

  let label: string;
  switch (period) {
    case 'weekly':
      since.setUTCDate(since.getUTCDate() - 7);
      label = 'Weekly (last 7 days)';
      break;
    case 'monthly':
      subtractOneUTCMonth(since);
      label = 'Monthly (last month)';
      break;
    case 'yearly':
      since.setUTCFullYear(since.getUTCFullYear() - 1);
      label = 'Yearly (last year)';
      break;
    case 'daily':
      since.setUTCDate(since.getUTCDate() - 1);
      label = 'Daily (last 24h)';
      break;
  }

  const sinceUTC = formatUTC(since);
  return { sinceUTC, label };
}

function formatUTC(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export default metrics;
