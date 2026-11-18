import test from 'node:test';
import assert from 'node:assert/strict';
import { initials, listAccent, listTitle, repoName, sourceLabel, taskRef, timeAgo } from '../src/ui/present.ts';

test('listAccent: known lists map to semantic tokens, unknown ones are stable', () => {
  assert.equal(listAccent('done'), 'var(--oc-success)');
  assert.equal(listAccent('In Progress'), 'var(--oc-info)');
  assert.equal(listAccent('Needs-Triage'), listAccent('Needs-Triage'));
  assert.match(listAccent('whatever'), /^var\(--oc-[a-z]+\)$/);
});

test('listTitle humanises ids', () => {
  assert.equal(listTitle('in_progress'), 'In progress');
  assert.equal(listTitle('open'), 'Open');
});

test('taskRef: numeric, key-like and opaque ids', () => {
  assert.equal(taskRef({ externalId: '42', adapterId: 'github' }), '#42');
  assert.equal(taskRef({ externalId: 'ENG-12', adapterId: 'linear' }), 'ENG-12');
  assert.equal(taskRef({ externalId: 'abcdef1234567890', adapterId: 'trello' }), '#abcdef12');
  assert.equal(taskRef({ externalId: 'x1', adapterId: 'local' }), '');
});

test('initials / repoName / sourceLabel', () => {
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials('@octocat'), 'OC');
  assert.equal(initials(null), '');
  assert.equal(repoName('github:owner/repo'), 'repo');
  assert.equal(repoName(null), '');
  assert.equal(sourceLabel('gitlab'), 'GitLab');
});

test('timeAgo buckets', () => {
  const now = 1_000_000_000_000;
  assert.equal(timeAgo(0, now), '');
  assert.equal(timeAgo(now - 10_000, now), 'just now');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5m ago');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3h ago');
  assert.equal(timeAgo(now - 2 * 86_400_000, now), '2d ago');
});
