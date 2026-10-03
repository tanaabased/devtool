import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matches from '../utils/get-mount-matches.ts';

describe('app root mount matches', () => {
  it('matches symlinked roots and sources without accepting a different directory', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-mount-'));
    try {
      const root = path.join(temp, 'root');
      const alias = path.join(temp, 'alias');
      const other = path.join(temp, 'other');
      fs.mkdirSync(root);
      fs.mkdirSync(other);
      fs.symlinkSync(root, alias, 'dir');
      fs.symlinkSync(path.join(temp, 'missing'), path.join(temp, 'broken'), 'dir');
      const volumes = [
        `${alias}:/alias:ro`,
        `${fs.realpathSync(root)}:/canonical`,
        `${other}:/other`,
        `${temp}/broken:/broken`,
      ];
      assert.deepEqual(matches(fs.realpathSync(root), volumes), ['/alias', '/canonical']);
      assert.deepEqual(matches(alias, volumes), ['/alias', '/canonical']);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('returns only existing app-root short-form bind destinations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-mount-'));
    try {
      assert.deepEqual(
        matches(root, [
          '.:/app:ro',
          `${root}:/code`,
          'missing:/missing',
          'named',
          { source: root, target: '/object' },
        ]),
        ['/app', '/code'],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
