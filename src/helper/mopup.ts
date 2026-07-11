import { EmbedBuilder, Colors } from 'discord.js';

import type { MopupInfo, MopupStatus } from '../types/index.js';
import { BOT_ICON_URL } from './constants.js';
import { formatHrDuration } from './hrDuration.js';

interface MopupWindow {
  startTime: number;
  endTime: number;
}

const MOPUP_EMBED_TITLE = 'Mopup';

function calculateMopupTiming(): MopupInfo {
  const now = Date.now();
  const utcOffset = new Date().getTimezoneOffset() * 60 * 1000;
  const hoursFromEpoch = Math.ceil((now + utcOffset) / (60 * 60 * 1000)) - 8;
  const daysSinceEpoch = Math.floor(hoursFromEpoch / 24);

  const { startTime, endTime } = getMopupWindow(daysSinceEpoch);
  const currentTime = Math.floor(now / 1000) * 1000;

  return determineMopupStatus(startTime - currentTime, endTime - currentTime, currentTime);
}

function getMopupWindow(day: number): MopupWindow {
  const dayInMs = 24 * 60 * 60 * 1000;
  const hourInMs = 60 * 60 * 1000;

  if (day % 2 === 0) {
    return {
      startTime: day * dayInMs + 26 * hourInMs,
      endTime: day * dayInMs + 34 * hourInMs,
    };
  }
  return {
    startTime: day * dayInMs + 8 * hourInMs,
    endTime: day * dayInMs + 24 * hourInMs,
  };
}

function determineMopupStatus(
  deltaStart: number,
  deltaEnd: number,
  currentTime: number,
): MopupInfo {
  if (deltaStart < 0) {
    if (deltaEnd > 0) {
      return {
        status: 'ACTIVE',
        color: Colors.Green,
        time: formatTime(deltaEnd),
        timestamp: Math.floor((currentTime + deltaEnd) / 1000),
      };
    }
    const nextStartDelta = deltaEnd + 24 * 60 * 60 * 1000;
    return {
      status: 'INACTIVE',
      color: Colors.Red,
      time: formatTime(nextStartDelta),
      timestamp: Math.floor((currentTime + nextStartDelta) / 1000),
    };
  }
  return {
    status: 'INACTIVE',
    color: Colors.Red,
    time: formatTime(deltaStart),
    timestamp: Math.floor((currentTime + deltaStart) / 1000),
  };
}

function formatTime(ms: number): string {
  return new Date(Math.abs(ms)).toISOString().slice(11, 19);
}

function getMopupOpenLabel(status: MopupStatus): 'open' | 'closed' {
  return status === 'ACTIVE' ? 'open' : 'closed';
}

function buildMopupFields(mopupInfo: MopupInfo): { name: string; value: string }[] {
  return [
    { name: 'Status:', value: `\`\`\`asciidoc\n${mopupInfo.status}\`\`\`` },
    { name: 'Time remaining:', value: `\`\`\`asciidoc\n${mopupInfo.time}\`\`\`` },
    { name: 'Local time:', value: `<t:${mopupInfo.timestamp}:f>` },
  ];
}

function buildMopupEmbed(startHr: bigint): EmbedBuilder {
  const mopupInfo = calculateMopupTiming();
  return new EmbedBuilder()
    .setColor(mopupInfo.color)
    .setTitle(MOPUP_EMBED_TITLE)
    .addFields(buildMopupFields(mopupInfo))
    .setFooter({ text: `via tc-bot - ${formatHrDuration(startHr)}`, iconURL: BOT_ICON_URL });
}

function buildMopupAnnouncementEmbed(
  startHr: bigint,
  mopupInfo = calculateMopupTiming(),
): EmbedBuilder {
  const openLabel = getMopupOpenLabel(mopupInfo.status);
  return new EmbedBuilder()
    .setColor(mopupInfo.color)
    .setTitle(MOPUP_EMBED_TITLE)
    .setDescription(`Mopup is now **${openLabel}**.`)
    .addFields(buildMopupFields(mopupInfo))
    .setFooter({ text: `via tc-bot - ${formatHrDuration(startHr)}`, iconURL: BOT_ICON_URL });
}

export {
  MOPUP_EMBED_TITLE,
  calculateMopupTiming,
  getMopupWindow,
  determineMopupStatus,
  formatTime,
  getMopupOpenLabel,
  buildMopupEmbed,
  buildMopupAnnouncementEmbed,
};
