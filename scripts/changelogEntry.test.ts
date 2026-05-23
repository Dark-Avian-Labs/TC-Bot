import { describe, expect, it } from 'vitest';

import { formatChangelogLine, parseBranchName, parseMergeCommitMessage } from './changelogEntry.mjs';

const REPO = 'Dark-Avian-Labs/tc-bot';

describe('parseBranchName', () => {
  it('parses type--description branches', () => {
    expect(parseBranchName('chore--update-CI-workflow-to-generate-changelog-automatically')).toEqual({
      typeLabel: 'chore',
      description: 'update CI workflow to generate changelog automatically',
    });
  });

  it('parses type(scope)--description branches', () => {
    expect(parseBranchName('fix(security)--adding-override-for-js-cookie')).toEqual({
      typeLabel: 'fix(security)',
      description: 'adding override for js cookie',
    });
  });
});

describe('parseMergeCommitMessage', () => {
  it('parses GitHub merge commits with colon branch refs', () => {
    expect(
      parseMergeCommitMessage(
        'Merge pull request #101 from Dark-Avian-Labs:chore--update-CI-workflow-to-generate-changelog-automatically',
      ),
    ).toEqual({
      typeLabel: 'chore',
      description: 'update CI workflow to generate changelog automatically',
      prNumber: '101',
    });
  });

  it('parses GitHub merge commits with slash branch refs', () => {
    expect(parseMergeCommitMessage('Merge pull request #92 from Dark-Avian-Labs/Feat--better-tests')).toEqual({
      typeLabel: 'feat',
      description: 'better tests',
      prNumber: '92',
    });
  });

  it('parses conventional squash commits with trailing PR numbers', () => {
    expect(parseMergeCommitMessage('feat(ci): enhance CI workflow (#94)')).toEqual({
      typeLabel: 'feat(ci)',
      description: 'enhance CI workflow',
      prNumber: '94',
    });
  });

  it('strips no-review markers from descriptions', () => {
    expect(parseMergeCommitMessage('chore: update deps no-review (#10)')).toEqual({
      typeLabel: 'chore',
      description: 'update deps',
      prNumber: '10',
    });
  });
});

describe('formatChangelogLine', () => {
  it('matches the backfilled changelog entry format', () => {
    expect(
      formatChangelogLine({
        version: '7.8.5',
        typeLabel: 'chore',
        description: 'update CI workflow to generate changelog automatically',
        prNumber: '101',
        repository: REPO,
      }),
    ).toBe(
      '- **v7.8.5** `chore` [#101](https://github.com/Dark-Avian-Labs/tc-bot/pull/101): update CI workflow to generate changelog automatically',
    );
  });
});
