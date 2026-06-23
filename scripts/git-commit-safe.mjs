/**
 * Commit via git-commit-tree so Cursor does not add Co-authored-by trailers.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT = 'git';

function resolveCommitTree() {
  const execPath = execSync(`${GIT} --exec-path`, { cwd: root, encoding: 'utf8' }).trim();
  return join(execPath, 'git-commit-tree');
}

const COMMIT_TREE = resolveCommitTree();

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
    ...opts,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`${cmd} ${args.join(' ')}: ${err}`);
  }
  return (r.stdout || '').trim();
}

function parseArgs(argv) {
  const messages = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-m' && argv[i + 1]) {
      messages.push(argv[++i]);
    } else if (!argv[i].startsWith('-')) {
      messages.push(argv[i]);
    }
  }
  if (!messages.length) {
    console.error('Usage: npm run commit:safe -- "commit message"');
    process.exit(1);
  }
  return messages;
}

const messages = parseArgs(process.argv.slice(2));

const authorName = process.env.GIT_AUTHOR_NAME || 'Star777';
const authorEmail = process.env.GIT_AUTHOR_EMAIL || 'dudgusl009@gmail.com';

const env = {
  GIT_AUTHOR_NAME: authorName,
  GIT_AUTHOR_EMAIL: authorEmail,
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || authorName,
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || authorEmail,
};

const stagedCheck = spawnSync(GIT, ['diff', '--cached', '--quiet'], { cwd: root, encoding: 'utf8' });
if (stagedCheck.status === 0) {
  console.error('[commit:safe] Nothing staged. Run: git add <files>');
  process.exit(1);
}

const tree = run(GIT, ['write-tree'], { env });

let parentArgs = [];
try {
  const parent = run(GIT, ['rev-parse', 'HEAD'], { env });
  if (parent) parentArgs = ['-p', parent];
} catch {
  /* first commit */
}

const treeArgs = [tree, ...parentArgs];
for (const m of messages) {
  treeArgs.push('-m', m);
}

if (!existsSync(COMMIT_TREE)) {
  console.error(`[commit:safe] git-commit-tree not found at ${COMMIT_TREE}`);
  process.exit(1);
}

const newCommit = run(COMMIT_TREE, treeArgs, { env });
run(GIT, ['reset', '--hard', newCommit], { env });

console.log(`[commit:safe] ${newCommit.slice(0, 7)} ${messages[0]}`);
console.log(`[commit:safe] Author: ${authorName} <${authorEmail}>`);
