import assert from 'node:assert/strict';

import { parseDocument } from 'yaml';

import configSchemas from '../lib/config-schemas.ts';
import edit from '../utils/edit-config-document.ts';

describe('targeted configuration document edits', () => {
  it('edits schema keys while preserving unrelated comments, anchors and literal keys', () => {
    const original = parseDocument(
      '# settings\ncommandName: old # command\nshared: &shared {keep: false}\ncopy: *shared\nlabels:\n  My_Label: old\n',
    );
    const result = edit(
      original,
      [
        { op: 'set', path: 'command-name', value: 'new' },
        { op: 'set', path: ['labels', 'My_Label'], value: 0 },
        { op: 'set', path: ['labels', 'literal.dot'], value: false },
      ],
      configSchemas.runtime,
      { force: true },
    );
    assert.match(String(result), /# settings/);
    assert.match(String(result), /command-name: new # command/);
    assert.match(String(result), /&shared/);
    assert.match(String(result), /copy: \*shared/);
    assert.deepEqual(result.toJS().labels, { My_Label: 0, 'literal.dot': false });
    assert.equal(original.toJS().commandName, 'old');
  });
  it('protects descendants and replacement/deletion of containing objects', () => {
    const original = parseDocument('config:\n  system:\n    cache: false\n');
    for (const path of ['config.system.cache', 'config.system', 'config'])
      for (const op of ['set', 'delete'] as const)
        assert.throws(
          () => edit(original, [{ op, path, value: {} }], configSchemas.appDefinition),
          /force/,
        );
    assert.equal(
      edit(
        original,
        [{ op: 'set', path: 'config.system.cache', value: true }],
        configSchemas.appDefinition,
        { force: true },
      ).toJS().config.system.cache,
      true,
    );
    assert.throws(
      () =>
        edit(
          original,
          [{ op: 'set', path: 'config.system.identity', value: 'other' }],
          configSchemas.appDefinition,
          { force: true },
        ),
      /supplied by an app/,
    );
    assert.throws(
      () =>
        edit(
          original,
          [{ op: 'set', path: 'config', value: { identity: 'other' } }],
          configSchemas.appDefinition,
          { force: true },
        ),
      /supplied by an app/,
    );
  });
  it('rejects alias traversal, ambiguous keys, invalid values and empty paths', () => {
    const original = parseDocument('shared: &s {cache: true}\ncopy: *s\n');
    for (const path of ['shared.cache', 'copy.cache', 'shared', 'copy'])
      assert.throws(() => edit(original, [{ op: 'delete', path }], {}), /alias or anchor/);
    assert.throws(
      () =>
        edit(
          parseDocument('dataRoot: a\ndata-root: b\n'),
          [{ op: 'set', path: 'dataRoot', value: 'c' }],
          configSchemas.runtime,
        ),
      /ambiguous/,
    );
    assert.throws(
      () =>
        edit(
          parseDocument('{}'),
          [{ op: 'set', path: 'cache', value: 'false' }],
          configSchemas.runtime,
        ),
      /boolean/,
    );
    for (const path of ['', [], ['']])
      assert.throws(() => edit(original, [{ op: 'delete', path }], {}), /nonempty/);
  });
  it('edits a selected section and leaves other sections intact', () => {
    const result = edit(
      parseDocument('config: {cache: true}\nname: app\n'),
      [{ op: 'delete', path: 'cache' }],
      configSchemas.runtime,
      { select: ['config'], app: true },
    );
    assert.deepEqual(result.toJS(), { config: {}, name: 'app' });
  });
  it('edits array elements and rejects values that JSON would silently discard', () => {
    const schema = {
      properties: {
        rows: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: { someValue: { type: 'number' as const } },
          },
        },
      },
    };
    const original = parseDocument('rows:\n  - some-value: 1\n');
    assert.deepEqual(
      edit(original, [{ op: 'set', path: ['rows', '0', 'someValue'], value: 0 }], schema).toJS(),
      { rows: [{ 'some-value': 0 }] },
    );
    for (const value of [NaN, Infinity, [undefined], Array(1)])
      assert.throws(
        () => edit(original, [{ op: 'set', path: 'unknown', value }], {}),
        /undefined or non-finite/,
      );
  });
});
