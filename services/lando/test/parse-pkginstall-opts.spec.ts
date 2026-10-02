import assert from 'node:assert/strict';
import parse from '../utils/parse-pkginstall-opts.ts';

describe('package installer options', () => {
  it('renders strings, arrays and ordered option pairs, preserving zero values', () => {
    assert.equal(parse('--quiet'), '--quiet');
    assert.equal(parse(['--uid', 0]), '--uid 0');
    assert.equal(parse({ uid: 0, group: 'staff' }), '--uid 0 --group staff');
    assert.equal(parse(false), '');
    assert.equal(parse(undefined), '');
  });
});
