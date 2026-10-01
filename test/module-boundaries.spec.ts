import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as api from '@tanaab/devtool';
import read from '../utils/read-file.ts';
import mergePromise from '../utils/merge-promise.ts';
import yaml from '../components/yaml.ts';
import { fixture } from './project-fixture.ts';

describe('ESM boundaries', () => {
  it('should expose only the supported runtime exports', () => {
    assert.deepEqual(Object.keys(api).sort(), ['createDevtool', 'name', 'version']);
  });
  it('should read JSON afresh and bound legacy data-module loading to explicit files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-esm-'));
    try {
      const file = path.join(directory, 'data.json');
      fs.writeFileSync(file, '{"first":true}');
      assert.deepEqual(read(file), { first: true });
      fs.writeFileSync(file, '{"second":true}');
      assert.deepEqual(read(file), { second: true });
      const dataModule = path.join(directory, 'data.cjs');
      fs.writeFileSync(dataModule, 'module.exports = {legacy: true};');
      assert.deepEqual(read(dataModule), { legacy: true });
      const imported = yaml.load(`value: !import ${file}`) as {
        value: { second: boolean; getMetadata(): { file: string } };
      };
      assert.equal(imported.value.second, true);
      assert.equal(imported.value.getMetadata().file, file);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  it('should preserve deferred promise and event behavior', async () => {
    let invoked = 0;
    const emitter = new EventEmitter();
    const operation = mergePromise(emitter, async () => {
      invoked++;
      return 7;
    });
    assert.equal(invoked, 0);
    assert.equal(operation, emitter);
    let event = '';
    operation.on('progress', (value) => {
      event = value;
    });
    operation.emit('progress', 'working');
    assert.equal(event, 'working');
    assert.equal(await operation, 7);
    assert.equal(invoked, 1);
  });
  it('should resolve service assets independently of the caller working directory', async () => {
    const f = fixture({
      web: {
        type: 'lando',
        image: 'alpine',
        certs: false,
        packages: { git: false, sudo: false, 'ssh-agent': false },
      },
    });
    try {
      const app = f.load();
      await app.start();
      const context = app.services[0].generateBuildContext();
      for (const name of ['boot.sh', 'entrypoint.sh', 'exec.sh', 'add-user.sh']) {
        const source = context.sources.find((source) => path.basename(source.source) === name);
        assert.ok(source, name);
        assert.ok(fs.statSync(source.source).isFile(), name);
      }
    } finally {
      f.cleanup();
    }
  });
});
