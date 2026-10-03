import assert from 'node:assert/strict';
import Config from '../lib/config.ts';
import masked from '../utils/masked-config-origins.ts';

describe('saved configuration masking', () => {
  const saved = { partial: { left: 1 }, removed: { nested: 1 }, items: [{ id: 'b', value: 2 }] };
  const config = new Config({
    sources: [
      { id: 'defaults', kind: 'object', data: { items: [{ id: 'a', value: 1 }] } },
      { id: 'target', kind: 'object', data: saved },
      {
        id: 'later',
        kind: 'object',
        data: { partial: { right: 2 }, removed: null, items: [{ id: 'b', value: 3 }] },
      },
    ],
  });
  config.compile();
  it('does not mistake an unrelated higher-priority sibling for a masked edit', () => {
    assert.deepEqual(masked(config, 'target', ['partial'], saved.partial), []);
  });
  it('detects ancestor replacement and maps ID-array edits to their effective indices', () => {
    assert.deepEqual(
      masked(config, 'target', ['removed'], saved.removed).map(({ source }) => source),
      ['later'],
    );
    assert.deepEqual(
      masked(config, 'target', ['items'], saved.items).map(({ source }) => source),
      ['later'],
    );
  });
});
