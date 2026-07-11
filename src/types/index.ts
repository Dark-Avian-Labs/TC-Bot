import type { sheets_v4 } from '@googleapis/sheets';
import type {
  ChatInputCommandInteraction,
  Client,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';

type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface Command {
  data: CommandData;
  examples?: string[];
  execute(interaction: ChatInputCommandInteraction): Promise<void> | Promise<unknown>;
  handleSelect?(interaction: StringSelectMenuInteraction): Promise<void> | Promise<unknown>;
}

export interface Event {
  name: string;
  once?: boolean;
  execute(...args: unknown[]): Promise<void> | void;
}

export type MopupStatus = 'ACTIVE' | 'INACTIVE';

export interface MopupInfo {
  status: MopupStatus;
  color: number;
  time: string;
  timestamp: number;
}

export interface KillResult {
  count: number;
  name: string;
  tier: number;
  type: string;
}

export interface GearCalculations {
  [level: number]: string;
}

export interface HealingCosts {
  resources: Record<string, { current: number; optimal: number }>;
  special: Record<string, { current: number; optimal: number }>;
  other: Record<string, number>;
  totalUnits: number;
  modifier: number;
  optimal: { modifier: number; units: number };
  optQty: number;
  hasData: boolean;
}

export class TroopRow {
  private data: Map<string, unknown>;

  constructor(headers: string[], values: unknown[]) {
    this.data = new Map();
    headers.forEach((header, index) => {
      this.data.set(header, values[index] ?? '');
    });
  }

  get(key: string): unknown {
    return this.data.get(key);
  }
}

export interface CacheEntry {
  rows?: TroopRow[];
  expiresAt?: number;
  loadingPromise?: Promise<TroopRow[]>;
}

export interface GoogleSheetsClient {
  sheetsApi: sheets_v4.Sheets;
  spreadsheetId: string;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
  GoogleSheets: GoogleSheetsClient | null;
}

export interface CommandUsage {
  commandName: string;
  userId?: string;
  guildId?: string | null;
  success: boolean;
  errorMessage?: string;
}

export interface MetricsTotals {
  total_count: number;
  success_count: number;
  failure_count: number;
}

export interface MetricsTopCommand {
  command_name: string;
  cnt: number;
}
