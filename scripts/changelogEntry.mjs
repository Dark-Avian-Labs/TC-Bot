export function normalizeDescription(description) {
  return description.replace(/\s*(?:-\s*)?(?:no-reivew|no-review|NCRR)\s*$/gi, '').trim();
}

export function humanizeBranchDescription(text) {
  return text.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractBranchFromMergeRef(ref) {
  const trimmed = ref.trim();
  if (trimmed.includes(':')) {
    return trimmed.slice(trimmed.indexOf(':') + 1);
  }

  const slashIndex = trimmed.indexOf('/');
  return slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1);
}

export function parseBranchName(branch) {
  const trimmed = branch.trim();
  const match = trimmed.match(/^(\w+)(?:\(([^)]+)\))?--(.+)$/);
  if (match) {
    const [, type, scope, rest] = match;
    const typeLabel = scope ? `${type.toLowerCase()}(${scope})` : type.toLowerCase();
    return {
      typeLabel,
      description: normalizeDescription(humanizeBranchDescription(rest)),
    };
  }

  return {
    typeLabel: 'chore',
    description: normalizeDescription(humanizeBranchDescription(trimmed)),
  };
}

export function parseMergeCommitMessage(message) {
  const subject = message.split('\n')[0].trim();
  if (!subject) {
    return { typeLabel: 'chore', description: 'Release', prNumber: null };
  }

  const mergeMatch = subject.match(/^Merge pull request #(\d+) from (.+)$/i);
  if (mergeMatch) {
    const branch = extractBranchFromMergeRef(mergeMatch[2]);
    return {
      ...parseBranchName(branch),
      prNumber: mergeMatch[1],
    };
  }

  const prEndMatch = subject.match(/\(#(\d+)\)\s*$/);
  const prNumber = prEndMatch?.[1] ?? null;
  const withoutPr = subject.replace(/\s*\(#\d+\)\s*$/, '').trim();

  const conventionalMatch = withoutPr.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (conventionalMatch) {
    const [, type, scope, breaking] = conventionalMatch;
    const baseTypeLabel = scope ? `${type.toLowerCase()}(${scope})` : type.toLowerCase();
    const typeLabel = breaking ? `${baseTypeLabel}!` : baseTypeLabel;
    return {
      typeLabel,
      description: normalizeDescription(conventionalMatch[4]),
      prNumber,
    };
  }

  return {
    typeLabel: 'chore',
    description: normalizeDescription(withoutPr || subject),
    prNumber,
  };
}

export function formatChangelogLine({ version, typeLabel, description, prNumber, repository }) {
  const repoBase = repository ? `https://github.com/${repository}` : '';
  const prLink = prNumber && repoBase ? `[#${prNumber}](${repoBase}/pull/${prNumber})` : null;

  if (prLink) {
    return `- **v${version}** \`${typeLabel}\` ${prLink}: ${description}`;
  }

  return `- **v${version}** \`${typeLabel}\`: ${description}`;
}

export function changelogHasVersion(content, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\*\\*v${escaped}\\*\\*`).test(content);
}
