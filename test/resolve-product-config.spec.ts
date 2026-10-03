import assert from 'node:assert/strict';
import Config from '../lib/config.ts';
import resolve from '../utils/resolve-product-config.ts';
import type { ProductSettings } from '../lib/types.ts';

describe('resolved product settings', () => {
  it('derives the cache root without mutating the compiled source and requires complete settings', () => {
    const config = Config.from<ProductSettings>({
      identity: 'example',
      commandName: 'example',
      envPrefix: 'EXAMPLE',
      dataRoot: '/data',
      cache: true,
    });
    const resolved = resolve(config);
    assert.equal(resolved.cacheRoot, '/data/cache');
    resolved.commandName = 'another';
    assert.equal(resolve(config).commandName, 'example');
    assert.equal(config.get('cacheRoot'), undefined);
    assert.throws(() => resolve(Config.from<ProductSettings>({})), /requires identity/);
  });
});
