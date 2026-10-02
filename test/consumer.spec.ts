import type * as Consumer from '../fixtures/source-consumer.ts';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../utils/create-test-project.ts';

describe('downstream source consumer (#7)', () => {
  it('runs an external copy through the public package and isolated product instances', async () => {
    const f = fixture();
    try {
      fs.copyFileSync(
        path.join(import.meta.dirname, '../fixtures/source-consumer.ts'),
        path.join(f.root, 'consumer.ts'),
      );
      fs.writeFileSync(
        path.join(f.root, '.wrapper.yml'),
        `services:
  web:
    type: lando
    api: 4
    image: alpine:3.20
    command: [sleep, infinity]
    user: consumer
    certs: false
    packages: {git: false, sudo: false, ssh-agent: false}
`,
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
