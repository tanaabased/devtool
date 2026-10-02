import assert from 'node:assert/strict';

import { ImportArray, ImportObject, ImportScalar, ImportString } from '../lib/yaml.ts';
import merge, { type Provenance } from '../utils/merge-config.ts';

describe('merge configuration sources', () => {
  it('unboxes imported scalars after recording origins, including matched IDs', () => {
    const provenance: Provenance = new Map();
    const metadata = { file: '/source/value.json' };
    const original = merge(
      {},
      { flag: { old: true }, rows: [{ id: 0, keep: true }] },
      { source: 'defaults', revision: 0 },
      provenance,
    );
    const result = merge(
      original,
      {
        flag: new ImportScalar(false, metadata),
        empty: new ImportScalar(null, metadata),
        name: new ImportString('', metadata),
        rows: [
          { id: new ImportScalar(0, metadata), added: true },
          { id: new ImportString('0', metadata) },
        ],
      },
      { source: 'file', revision: 0 },
      provenance,
    );
    assert.deepEqual(result, {
      flag: false,
      empty: null,
      name: '',
      rows: [{ id: 0, keep: true, added: true }, { id: '0' }],
    });
    assert.equal(provenance.has('["flag","old"]'), false);
    for (const key of ['["flag"]', '["empty"]', '["name"]', '["rows","0","id"]'])
      assert.equal(provenance.get(key)?.at(-1)?.importedFrom, metadata.file);
  });
  it('replaces subtrees without stale descendant provenance or prototype mutation', () => {
    const provenance: Provenance = new Map();
    const first = { nested: { old: true }, list: [1, 2], zero: 0, disabled: false };
    const original = merge({}, first, { source: 'first', revision: 0 }, provenance);
    const next = merge(
      original,
      JSON.parse('{"nested":null,"list":[3],"__proto__":{"polluted":true}}'),
      { source: 'next', revision: 0 },
      provenance,
    );
    assert.equal(provenance.has('["nested","old"]'), false);
    assert.equal(provenance.has('["list","1"]'), false);
    assert.equal(Object.getPrototypeOf(next), Object.prototype);
    assert.equal(Object.hasOwn(next, '__proto__'), true);
    assert.deepEqual(next.list, [3]);
    assert.equal(next.zero, 0);
    assert.equal(next.disabled, false);
    assert.deepEqual(first, original);
    const keyed = merge(
      original,
      { nested: [{ id: 'new', value: true }] },
      { source: 'keyed', revision: 0 },
      provenance,
    );
    assert.deepEqual(keyed.nested, [{ id: 'new', value: true }]);
    assert.equal(provenance.has('["nested","old"]'), false);
  });
  it('merges nested arrays by ID while retaining field origins and caller ownership', () => {
    const provenance: Provenance = new Map();
    const first = {
      rows: [
        {
          id: 10,
          debug: false,
          ports: [80, 443],
          children: [
            { id: 'a', keep: true },
            { id: 'b', keep: false },
          ],
        },
        { id: 2, image: 'postgres' },
      ],
    };
    const overlay = {
      rows: [
        { id: 2, image: 'postgres:17' },
        { id: 10, ports: [8080], children: [{ id: 'b', added: 0 }] },
        { id: '2', image: 'redis' },
      ],
    };
    const original = merge({}, first, { source: 'defaults', revision: 0 }, provenance);
    const result = merge(original, overlay, { source: 'app', revision: 1 }, provenance);
    assert.deepEqual(result.rows, [
      {
        id: 10,
        debug: false,
        ports: [8080],
        children: [
          { id: 'a', keep: true },
          { id: 'b', keep: false, added: 0 },
        ],
      },
      { id: 2, image: 'postgres:17' },
      { id: '2', image: 'redis' },
    ]);
    assert.equal(provenance.get('["rows","0","debug"]')?.at(-1)?.source, 'defaults');
    assert.equal(provenance.get('["rows","1","image"]')?.at(-1)?.source, 'app');
    assert.equal(provenance.get('["rows","0","children","1","keep"]')?.at(-1)?.source, 'defaults');
    assert.equal(provenance.get('["rows","0","children","1","added"]')?.at(-1)?.source, 'app');
    assert.equal(provenance.has('["rows","0","ports","1"]'), false);
    assert.deepEqual(first, original);
    assert.equal(Object.hasOwn(overlay.rows[1]!, 'debug'), false);
    assert.deepEqual(
      merge(result, { rows: [] }, { source: 'empty', revision: 0 }, provenance),
      result,
    );
  });

  it('rejects ambiguous ID arrays and replaces ordinary arrays', () => {
    const origin = { source: 'app', revision: 0 };
    for (const rows of [
      [{ id: 'a' }, { id: 'a' }],
      [{ id: 'a' }, {}],
      [{ id: 'a' }, 1],
      [{ id: null }],
    ])
      assert.throws(() => merge({}, { rows }, origin, new Map()), /array id|ID-matched arrays/);
    assert.deepEqual(
      merge({ rows: [{ name: 'old' }] }, { rows: [{ name: 'new' }] }, origin, new Map()),
      { rows: [{ name: 'new' }] },
    );
    assert.deepEqual(merge({ rows: [{ id: 'a' }] }, { rows: null }, origin, new Map()), {
      rows: null,
    });
  });

  it('retains imported origins for untouched and overridden fields in matched rows', () => {
    const provenance: Provenance = new Map();
    const first = merge(
      {},
      {
        rows: new ImportArray(
          [new ImportObject({ id: 'app', keep: false }, { file: '/defaults/row.yml' })],
          { file: '/defaults/rows.yml' },
        ),
      },
      { source: 'defaults', revision: 0 },
      provenance,
    );
    const result = merge(
      first,
      { rows: new ImportArray([{ id: 'app', port: 0 }], { file: '/app/rows.yml' }) },
      { source: 'app', revision: 0 },
      provenance,
    );
    assert.equal(provenance.get('["rows","0","keep"]')?.at(-1)?.importedFrom, '/defaults/row.yml');
    assert.equal(provenance.get('["rows","0","port"]')?.at(-1)?.importedFrom, '/app/rows.yml');
    assert.ok(result.rows instanceof ImportArray);
  });
});
