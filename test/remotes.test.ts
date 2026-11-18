// test/remotes.test.ts — pure git remote -v parsing for empty-repos discovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitRemotes } from '../src/domain/remotes.ts';

const eq: typeof assert.equal = assert.equal;
const deep: typeof assert.deepEqual = assert.deepEqual;

test('parses https and ssh remotes into provider repo keys (review #4)', () => {
  const output = [
    'origin\thttps://github.com/owner/app.git (fetch)',
    'origin\thttps://github.com/owner/app.git (push)',
    'upstream\tgit@gitlab.com:group/site.git (fetch)',
    'self\tgit@gitlab.example.com:group/inner.git (fetch)',
    'other\thttps://bitbucket.org/x/y.git (fetch)',
    '',
  ].join('\n');
  deep(parseGitRemotes(output), [
    'github:owner/app',
    'gitlab:group/site',
    'gitlab:gitlab.example.com/group/inner',
  ]);
});

test('malformed lines and duplicates are skipped', () => {
  const output = [
    'origin\tnot-a-url (fetch)',
    'origin\thttps://github.com/owner/dup.git (fetch)',
    'origin\thttps://github.com/owner/dup.git (fetch)',
    'weird\t',
    'origin\t',
  ].join('\n');
  deep(parseGitRemotes(output), ['github:owner/dup']);
  deep(parseGitRemotes(''), []);
});
