import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SKIP = new Set(['docs', 'style', 'refactor', 'test', 'build']);
const PATCH = new Set(['fix', 'perf', 'chore', 'ci', 'revert']);

function bumpOf(subject, body) {
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if ((match && match[3]) || /BREAKING CHANGE/.test(body)) return 'major';
  if (!match) return null;
  if (match[1] === 'feat') return 'minor';
  if (SKIP.has(match[1])) return null;
  if (PATCH.has(match[1])) return 'patch';
  return null;
}

function bumpVersion(version, level) {
  const [major, minor, patch] = version.split('.').map(Number);
  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    throw new Error(`version is not x.y.z: ${version}`);
  }
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function commitView(subject, body) {
  const forgejo = /^Merge pull request '(.+)' \(#(\d+)\)/.exec(subject);
  if (forgejo) return { subject: forgejo[1], pr: forgejo[2] };
  const github = /^Merge pull request #(\d+) from \S+/.exec(subject);
  if (github) {
    const line = body
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => /^(\w+)(\([^)]*\))?(!)?:/.test(entry));
    return { subject: line ?? subject, pr: github[1] };
  }
  const pr = /\(#(\d+)\)\s*$/.exec(subject);
  return { subject, pr: pr?.[1] ?? null };
}

function selfCheck() {
  const cases = [
    ['feat: add', '', 'minor'],
    ['feat(ui)!: drop', '', 'major'],
    ['fix: bug', '', 'patch'],
    ['perf: faster', '', 'patch'],
    ['chore: tidy', '', 'patch'],
    ['ci: pin', '', 'patch'],
    ['revert: undo', '', 'patch'],
    ['docs: readme', '', null],
    ['style: fmt', '', null],
    ['refactor: move', '', null],
    ['test: cover', '', null],
    ['build: bundle', '', null],
    ['docs: x', 'BREAKING CHANGE: y', 'major'],
    ['wip', '', null],
  ];
  for (const [subject, body, expected] of cases) {
    const got = bumpOf(subject, body);
    if (got !== expected) throw new Error(`${subject} => ${got}, expected ${expected}`);
  }
  if (bumpVersion('1.2.3', 'major') !== '2.0.0') throw new Error('major');
  if (bumpVersion('1.2.3', 'minor') !== '1.3.0') throw new Error('minor');
  if (bumpVersion('1.2.3', 'patch') !== '1.2.4') throw new Error('patch');
  const view = commitView("Merge pull request 'feat: add gear' (#12)", '');
  if (
    view.subject !== 'feat: add gear' ||
    view.pr !== '12' ||
    bumpOf(view.subject, '') !== 'minor'
  ) {
    throw new Error('forgejo merge');
  }
  console.log('ok');
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function packageVersion() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`package.json version is not x.y.z: ${version}`);
  return version;
}

function resolve() {
  let previous = null;
  try {
    const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
    previous = tag.startsWith('v') ? tag.slice(1) : null;
  } catch {
    previous = null;
  }

  // ponytail: no v* tag yet, so the first publish tags package.json and ignores history. Tag v<version> is the upgrade once a repo already has that commit on main.
  if (!previous || !/^\d+\.\d+\.\d+$/.test(previous)) {
    const version = packageVersion();
    return {
      version,
      previous: '',
      release: true,
      tag: `v${version}`,
      notes: `- Start at ${version}.\n`,
    };
  }

  const raw = git(['log', '--first-parent', '--format=%H%x1f%s%x1f%b%x1e', `v${previous}..HEAD`]);
  const commits = raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body] = entry.split('\x1f');
      const view = commitView(subject, body ?? '');
      return { sha: sha.slice(0, 7), subject: view.subject, pr: view.pr, body: body ?? '' };
    });

  const levels = commits.map((commit) => bumpOf(commit.subject, commit.body));
  const release = levels.some(Boolean);
  const level = levels.includes('major') ? 'major' : levels.includes('minor') ? 'minor' : 'patch';
  const version = release ? bumpVersion(previous, level) : previous;
  const notes =
    commits
      .map((commit) => `- ${commit.subject}${commit.pr ? ` (#${commit.pr})` : ''} ${commit.sha}`)
      .join('\n') || `- No commits since v${previous}.`;

  return { version, previous, release, tag: `v${version}`, notes: `${notes}\n` };
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  process.exit(0);
}

const result = resolve();
const notesPath = path.join(process.env.RUNNER_TEMP ?? tmpdir(), `notes-${result.tag}.md`);
writeFileSync(notesPath, result.notes);

const out = [
  `version=${result.version}`,
  `previous=${result.previous}`,
  `release=${result.release}`,
  `tag=${result.tag}`,
  `notes_path=${notesPath}`,
];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${out.join('\n')}\n`);
console.log(out.join('\n'));
console.log(result.notes);

if (process.env.RELEASE_PUBLISH === '1' && result.release) {
  const token = process.env.GITHUB_TOKEN;
  const api = process.env.GITHUB_API_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (!token || !api || !repo || !sha) {
    throw new Error(
      'RELEASE_PUBLISH=1 needs GITHUB_TOKEN, GITHUB_API_URL, GITHUB_REPOSITORY, and GITHUB_SHA',
    );
  }
  const response = await fetch(`${api}/repos/${repo}/releases`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: result.tag,
      target_commitish: sha,
      name: result.tag,
      body: result.notes,
    }),
  });
  if (!response.ok) {
    console.error(await response.text());
    process.exit(1);
  }
  console.log(`release ${result.tag} created`);
}
