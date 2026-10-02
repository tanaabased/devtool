import type * as Consumer from './consumer-example.ts';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './project-fixture.ts';

describe('downstream source consumer (#7)', () => {
  it('runs an external copy through the public package and isolated product instances', async () => {
    const f = fixture();
    try {
      fs.copyFileSync(
        path.join(import.meta.dirname, './consumer-example.ts'),
        path.join(f.root, 'consumer.ts'),
      );
      fs.copyFileSync(
        path.join(import.meta.dirname, './consumer-app.yml'),
        path.join(f.root, '.wrapper.yml'),
      );
      fs.copyFileSync(
        path.join(import.meta.dirname, 'require-value.ts'),
        path.join(f.root, 'require-value.ts'),
      );
      const compose = f.engine.compose;
      f.engine.compose = async (...args) => {
        const result = await compose(...args);
        if (args[2][0] === 'exec') result.stdout = 'consumer-proof';
        return result;
      };
      const { verify } = (await import(
        pathToFileURL(path.join(f.root, 'consumer.ts')).href
      )) as typeof Consumer;
      const apps = await verify(path.resolve(import.meta.dirname, '..'), f.root, f.engine);
      assert.equal(apps.length, 2);
      assert.equal(f.calls.filter((call) => call[0] === 'build').length, 2);
      assert.equal(
        apps.every((app) => !fs.existsSync(app.stateFile)),
        true,
      );
    } finally {
      f.cleanup();
    }
  });
});
