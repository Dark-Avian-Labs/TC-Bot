import { readFileSync, writeFileSync } from 'node:fs';

function normalizeDescription(description) {
  return description.replace(/\s*(?:-\s*)?(?:no-reivew|no-review|NCRR)\s*$/gi, '').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRepoName(repository) {
  if (typeof repository !== 'string' || !repository.includes('/')) {
    return null;
  }

  const [owner, name] = repository.split('/');
  if (!owner || !name) {
    return null;
  }

  return name;
}

function changelogHasVersion(content, version) {
  const escaped = escapeRegex(version);
  return new RegExp(`\\*\\*v${escaped}\\*\\*`).test(content);
}

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/append-changelog.mjs <version>');
  process.exit(1);
}

const mergeMessage = (process.env.MERGE_COMMIT_MESSAGE ?? '').split('\n')[0].trim();
const repository = process.env.GITHUB_REPOSITORY ?? '';
const repoName = parseRepoName(repository);

const prMatch = mergeMessage.match(/\(#(\d+)\)\s*$/);
const prNumber = prMatch?.[1] ?? null;
const subject = mergeMessage.replace(/\s*\(#\d+\)\s*$/, '').trim();

const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
let typeLabel = 'chore';
let description = subject || 'Release';

if (conventionalMatch) {
  const [, type, scope] = conventionalMatch;
  typeLabel = scope ? `${type}(${scope})` : type;
  description = normalizeDescription(conventionalMatch[4]);
} else {
  description = normalizeDescription(description);
}

const repoBase = repository ? `https://github.com/${repository}` : '';
const prLink = prNumber && repoBase ? `[#${prNumber}](${repoBase}/pull/${prNumber})` : null;

const line = prLink
  ? `- **v${version}** \`${typeLabel}\` ${prLink}: ${description}`
  : `- **v${version}** \`${typeLabel}\`: ${description}`;

const changelogPath = 'CHANGELOG.md';
let content;

try {
  content = readFileSync(changelogPath, 'utf8');
} catch (error) {
  console.error(`Failed to read ${changelogPath}: ${error.message}`);
  process.exit(1);
}

if (changelogHasVersion(content, version)) {
  console.log(`CHANGELOG already contains v${version}; skipping.`);
  process.exit(0);
}

if (!content.endsWith('\n')) {
  content += '\n';
}

try {
  writeFileSync(changelogPath, `${content}${line}\n`);
} catch (error) {
  console.error(`Failed to write ${changelogPath}: ${error.message}`);
  process.exit(1);
}

console.log(`Appended changelog entry for ${repoName ?? 'repo'} v${version}.`);
