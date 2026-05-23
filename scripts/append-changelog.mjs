import { readFileSync, writeFileSync } from 'node:fs';

import {
  changelogHasVersion,
  formatChangelogLine,
  parseMergeCommitMessage,
} from './changelogEntry.mjs';

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

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/append-changelog.mjs <version>');
  process.exit(1);
}

const mergeMessage = process.env.MERGE_COMMIT_MESSAGE ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const repoName = parseRepoName(repository);

const parsed = parseMergeCommitMessage(mergeMessage);
const line = formatChangelogLine({
  version,
  repository,
  ...parsed,
});

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
