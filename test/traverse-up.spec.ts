import assert from 'node:assert/strict';
import path from 'node:path';
import traverse from '../utils/traverse-up.ts';

describe('utils/traverse-up', () => {
  it('should preserve nearest-first search order and candidate priority through the root', () => {
    const root = path.parse(process.cwd()).root;
    assert.deepEqual(traverse(['config', 'other'], path.join(root, 'parent', 'child')), [
      path.join(root, 'parent', 'child', 'config'),
      path.join(root, 'parent', 'child', 'other'),
      path.join(root, 'parent', 'config'),
      path.join(root, 'parent', 'other'),
      path.join(root, 'config'),
      path.join(root, 'other'),
    ]);
    assert.deepEqual(traverse([], root), []);
  });
});
