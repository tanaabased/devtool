import assert from 'node:assert/strict';
import { load } from '../utils/read-fixture-yaml.ts';

describe('utils/read-fixture-yaml', () => {
  it('should read controlled Compose fixtures without enabling application import tags', () => {
    assert.deepEqual(load('services: {web: {image: alpine}}'), {
      services: { web: { image: 'alpine' } },
    });
    assert.throws(() => load('value: !import /fixture'), /unknown tag/);
  });
});
