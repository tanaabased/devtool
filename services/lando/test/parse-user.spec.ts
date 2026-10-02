import assert from 'node:assert/strict';
import parse from '../utils/parse-user.ts';

describe('parse service user', () => {
  it('normalizes names, IDs, aliases and disabled inputs', () => {
    assert.deepEqual(parse('alice:1000:1001'), { name: 'alice', uid: '1000', gid: '1001' });
    assert.deepEqual(parse('root'), { name: 'root' });
    assert.deepEqual(parse({ username: 'alice', uid: 0, gid: 0 }), {
      name: 'alice',
      uid: 0,
      gid: 0,
    });
    assert.deepEqual(parse({ name: 'canonical', user: 'alias' }), { name: 'canonical' });
    for (const value of [undefined, null, false, 42, []]) assert.deepEqual(parse(value), {});
  });
});
