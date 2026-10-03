import assert from 'node:assert/strict';
import Config from '../lib/config.ts';
import configRows from '../utils/config-rows.ts';

describe('configuration rows', () => {
  it('sorts keys, retains arrays and empty values, and carries actual provenance', () => {
    const schema = { properties: { knownKey: {} } };
    const config = new Config({
      schema,
      sources: [
        {
          id: 'first',
          kind: 'object',
          data: { knownKey: 1, z: [], a: null, blank: '', empty: {} },
        },
        { id: 'last', kind: 'object', data: { knownKey: 0 } },
      ],
    });
    config.compile();
    const rows = configRows(config, config.get(), schema);
    assert.deepEqual(
      rows.map(({ key, value }) => [key, value]),
      [
        ['a', null],
        ['blank', ''],
        ['empty', {}],
        ['known-key', 0],
        ['z', []],
      ],
    );
    assert.equal(rows[3]?.winner?.source, 'last');
    assert.deepEqual(
      rows[3]?.contributors.map(({ source }) => source),
      ['first', 'last'],
    );
  });
});
