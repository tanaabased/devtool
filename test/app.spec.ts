import assert from 'node:assert/strict';
import fs from 'node:fs';
import { App, Config, createProductConfig, type AppConfig } from '../lib/devtool.ts';
import { fixture } from '../utils/create-test-project.ts';

describe('App preparation state', () => {
  it('uses a stable snapshot and prepares once without changing its caller Config', () => {
    const f = fixture();
    try {
      const data = Config.from<AppConfig>(
        { services: { web: { type: 'l337', image: 'alpine' } }, config: { cache: false } },
        { root: f.root },
      );
      const config = createProductConfig(f.options);
      const app = new App({ root: f.root, definition: data, config, engine: f.engine });
      const metadata = app.getMetadata();
      assert.equal(fs.existsSync(app._dir), false);
      assert.deepEqual(app.services, []);
      assert.deepEqual(f.calls, []);
      assert.equal(app.config.cache, false);
      data.replaceSource('memory', { id: 'memory', kind: 'object', data: { services: {} } });
      app.definition.replaceSource('memory', {
        id: 'memory',
        kind: 'object',
        data: { services: {} },
      });
      assert.equal(app.getMetadata().definition, metadata.definition);
      assert.throws(() => {
        app.config.cache = true;
      }, TypeError);
      app.prepare();
      const service = app.services[0];
      const fragments = app.composeData.length;
      app.prepare();
      assert.equal(app.services[0], service);
      assert.equal(app.services.length, 1);
      assert.equal(app.composeData.length, fragments);
      assert.equal(
        config.sources.some(({ role }) => role === 'app'),
        false,
      );
    } finally {
      f.cleanup();
    }
  });
});
