import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormValid, resolveCreateSelection } from '../src/ui/createState.ts';

const adapters = [{ id: 'local' }, { id: 'github' }, { id: 'gitlab' }];
const projects = {
  github: ['github:owner/repo'],
  gitlab: ['gitlab:group/project'],
};

test('create defaults never pair a source with another source project', () => {
  assert.deepEqual(resolveCreateSelection(adapters, projects, {
    adapterId: 'github', projectRef: 'gitlab:group/project',
  }), { adapterId: 'github', projectRef: 'github:owner/repo' });
});

test('create defaults preserve a valid source/project pair and handle local', () => {
  assert.deepEqual(resolveCreateSelection(adapters, projects, {
    adapterId: 'gitlab', projectRef: 'gitlab:group/project',
  }), { adapterId: 'gitlab', projectRef: 'gitlab:group/project' });
  assert.deepEqual(resolveCreateSelection(adapters, projects, {
    adapterId: 'local', projectRef: 'github:owner/repo',
  }), { adapterId: 'local', projectRef: null });
});

test('create falls back to the first available source and reports an empty project list', () => {
  assert.deepEqual(resolveCreateSelection([{ id: 'github' }], { github: [] }, {
    adapterId: 'missing', projectRef: null,
  }), { adapterId: 'github', projectRef: null });
});

test('create submission validates title and the selected project membership', () => {
  assert.equal(createFormValid('github', 'gitlab:group/project', 'Title', projects), false);
  assert.equal(createFormValid('github', 'github:owner/repo', '  ', projects), false);
  assert.equal(createFormValid('github', 'github:owner/repo', 'Title', projects), true);
  assert.equal(createFormValid('local', null, 'Title', projects), true);
});
