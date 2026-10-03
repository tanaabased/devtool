import assert from 'node:assert/strict';
import productEnvironmentSource from '../utils/product-environment-source.ts';

describe('product environment source', () => {
  it('captures values and keeps discovery controls outside settings', () => {
    const env = { CUSTOM_CACHE: 'false' };
    const source = productEnvironmentSource('CUSTOM', env);
    env.CUSTOM_CACHE = 'true';
    assert.equal(source.values.CUSTOM_CACHE, 'false');
    assert.equal(source.prefix, 'CUSTOM');
    assert.equal(source.fields.CONFIG_DIR, undefined);
  });
  it('parses false and zero without accepting malformed booleans', () => {
    const { fields } = productEnvironmentSource('CUSTOM', {});
    assert.equal(fields.CACHE?.parse?.('0'), false);
    assert.equal(fields.CACHE?.parse?.('true'), true);
    assert.equal(fields.APP_FILES, undefined);
    for (const key of ['APP_FILE', 'APP_FILES', 'PRE_FILES', 'POST_FILES'])
      assert.throws(
        () => productEnvironmentSource('CUSTOM', { [`CUSTOM_${key}`]: 'other' }),
        /read-only.*constructing the CLI/,
      );
    assert.throws(() => fields.CACHE?.parse?.('nope'), /CUSTOM_CACHE/);
  });
});
