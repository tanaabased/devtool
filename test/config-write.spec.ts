import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Config from '../lib/config.ts';
import schemas from '../lib/config-schemas.ts';

describe('Config write revisions', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-config-edit-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('publishes only selected source edits and retains masked values, forks and snapshots', () => {
    const file = path.join(root, 'config.yml');
    fs.writeFileSync(file, '# original\ncache: true\nusername: lower\n');
    const config = new Config({
      root,
      schema: schemas.runtime,
      sources: [
        { id: 'defaults', kind: 'object', data: { cache: true } },
        { id: 'user', kind: 'file', file, writable: true },
        { id: 'caller', kind: 'object', data: { username: 'higher' } },
      ],
    });
    const original = config.compile();
    const fork = config.fork();
    const result = config.writeSource('user', [
      { op: 'set', path: 'cache', value: false },
      { op: 'set', path: 'username', value: 'saved' },
    ]);
    assert.equal(result.file, file);
    assert.equal(result.revision, config.revision);
    assert.equal(config.get('cache'), false);
    assert.equal(config.get('username'), 'higher');
    assert.equal(config.explain('cache').winner?.revision, 1);
    assert.equal(config.explain('username').winner?.source, 'caller');
    assert.equal(original.values.cache, true);
    assert.equal(fork.compile().values.cache, true);
    assert.match(fs.readFileSync(file, 'utf8'), /username: saved/);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /higher/);
    config.writeSource('user', [{ op: 'delete', path: 'cache' }]);
    assert.equal(config.get('cache'), true);
    assert.equal(config.explain('cache').winner?.source, 'defaults');
  });
  it('preserves Config and file on invalid, protected and stale writes', () => {
    const file = path.join(root, 'config.json');
    fs.writeFileSync(file, '{"cache":true}');
    const config = new Config({
      schema: schemas.runtime,
      sources: [
        { id: 'managed', kind: 'file', file, writable: true },
        { id: 'caller', kind: 'object', data: { cache: true } },
      ],
    });
    const snapshot = config.compile();
    assert.throws(
      () => config.writeSource('managed', [{ op: 'set', path: 'cache', value: 'false' }]),
      /boolean/,
    );
    assert.throws(
      () => config.writeSource('managed', [{ op: 'set', path: 'system.cache', value: false }]),
      /force/,
    );
    assert.equal(config.snapshot(), snapshot);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"cache":true}');
    fs.writeFileSync(file, '{"cache":false}');
    assert.throws(
      () => config.writeSource('managed', [{ op: 'set', path: 'cache', value: true }]),
      /changed on disk/,
    );
    assert.equal(config.snapshot(), snapshot);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"cache":false}');
  });
  it('requires writable destinations and explicit creation, including for object-only input', () => {
    const config = new Config({
      root,
      schema: schemas.runtime,
      sources: [
        { id: 'object', kind: 'object', data: {} },
        { id: 'readonly', kind: 'file', file: 'readonly.yaml' },
        { id: 'js', kind: 'file', file: 'settings.mjs', writable: true },
        { id: 'managed', kind: 'file', file: 'new/config.json', writable: true, optional: true },
      ],
    });
    const edits = [{ op: 'set' as const, path: 'cache', value: false }];
    for (const id of ['object', 'readonly', 'js'])
      assert.throws(() => config.writeSource(id, edits), /writable JSON\/YAML/);
    const managed = new Config({
      root,
      schema: schemas.runtime,
      sources: [
        { id: 'managed', kind: 'file', file: 'new/config.json', writable: true, optional: true },
      ],
    });
    assert.throws(() => managed.writeSource('managed', edits), /requires create/);
    assert.equal(fs.existsSync(path.join(root, 'new')), false);
    managed.writeSource('managed', edits, { create: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'new/config.json'), 'utf8')), {
      cache: false,
    });
  });
  it('writes selected app sections without flattening imports or weakening identity', () => {
    fs.writeFileSync(path.join(root, 'child.yaml'), 'cache: false\n');
    const file = path.join(root, 'app.yaml');
    fs.writeFileSync(file, 'config:\n  username: old\nimported: !import child.yaml\n');
    const config = new Config({
      root,
      schema: schemas.runtime,
      sources: [{ id: 'app', kind: 'file', role: 'app', file, writable: true, select: ['config'] }],
    });
    config.compile();
    config.writeSource('app', [{ op: 'set', path: 'system.cache', value: false }], { force: true });
    assert.equal(config.get('system.cache'), false);
    assert.match(fs.readFileSync(file, 'utf8'), /imported: !import child.yaml/);
    assert.throws(
      () =>
        config.writeSource('app', [{ op: 'set', path: 'identity', value: 'other' }], {
          force: true,
        }),
      /supplied by an app/,
    );
    const whole = new Config({
      root,
      sources: [{ id: 'file', kind: 'file', file, writable: true }],
    });
    whole.compile();
    assert.throws(
      () => whole.writeSource('file', [{ op: 'set', path: 'imported.cache', value: true }]),
      /scalar or import/,
    );
    assert.equal(fs.readFileSync(path.join(root, 'child.yaml'), 'utf8'), 'cache: false\n');
  });
});
