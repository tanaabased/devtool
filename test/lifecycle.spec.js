'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {runCli} = require('../lib/cli');
const {createDevtool} = require('../lib/devtool');
const {fixture} = require('./project-fixture');

describe('L337 lifecycle (#4)', () => {
  let f;
  beforeEach(() => { f = fixture(); });
  afterEach(() => f.cleanup());
  it('builds sequentially before compose and persists only completed startup', async () => {
    fs.writeFileSync(f.file, 'services:\n  one: {type: l337, image: alpine}\n  two: {type: l337, image: alpine}\n');
    const app = f.load();
    await app.start();
    assert.deepEqual(f.calls.map(call => call[0]), ['build', 'inspect', 'build', 'inspect', 'compose']);
    assert.equal(JSON.parse(fs.readFileSync(app.stateFile)).running, true);
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.equal(compose.services.one.image, `${app.project}-one:latest`);
    assert.equal(compose.services.one.type, undefined);
    assert.equal(compose.services.one.build, undefined);
  });
  it('reuses built images across processes and reconstructs compose without rebuilding', async () => {
    await f.load().start();
    f.calls.length = 0;
    const app = f.load();
    assert.equal(app.getInfo().services[0].tag, `${app.project}-web:latest`);
    await app.start();
    assert.equal(f.calls.some(call => call[0] === 'build'), false);
    assert.equal(yaml.load(fs.readFileSync(app.composeFile, 'utf8')).services.web.image, `${app.project}-web:latest`);
  });
  it('rebuilds for changed configuration, missing images and explicit rebuild', async () => {
    await f.load().start();
    fs.appendFileSync(f.file, '\n');
    let app = f.load(); await app.start();
    assert.equal(f.calls.filter(call => call[0] === 'build').length, 1);
    const data = yaml.load(fs.readFileSync(f.file, 'utf8')); data.services.web.environment = {CHANGED: 'yes'};
    fs.writeFileSync(f.file, yaml.dump(data)); await f.load().start();
    f.images.clear(); await f.load().start();
    app = f.load(); await app.rebuild();
    assert.equal(f.calls.filter(call => call[0] === 'build').length, 4);
  });
  it('invalidates builds when copied file contents change', async () => {
    fs.writeFileSync(path.join(f.root, 'input'), 'before');
    fs.writeFileSync(f.file, 'services:\n  web:\n    type: l337\n    image:\n      imagefile: alpine\n      context: [input:/input]\n');
    await f.load().start(); await f.load().start();
    assert.equal(f.calls.filter(call => call[0] === 'build').length, 1);
    fs.writeFileSync(path.join(f.root, 'input'), 'after'); await f.load().start();
    assert.equal(f.calls.filter(call => call[0] === 'build').length, 2);
  });
  it('never starts containers or leaves successful state after a build failure', async () => {
    const app = f.load(); await app.start(); f.calls.length = 0;
    f.engine.buildError = Object.assign(new Error('broken build'), {code: 23});
    await assert.rejects(app.rebuild(), /broken build/);
    assert.equal(f.calls.some(call => call[0] === 'compose'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(app.stateFile)).services, {});
    assert.equal(app.state.running, false);
  });
  it('propagates startup and exec failure status through the CLI', async () => {
    f.engine.commandError = Object.assign(new Error('container command failed'), {code: 17});
    const output = []; const stream = {write: text => output.push(text)};
    const runtime = createDevtool(f.options);
    assert.equal(await runCli(['start'], {runtime, cwd: f.root, stdout: stream, stderr: stream}), 17);
    assert.equal(f.load().state.running, false);
    assert.equal(await runCli(['exec', 'web', '--', 'sh', '-c', 'exit 17'], {runtime, cwd: f.root, stdout: stream, stderr: stream}), 17);
    assert.match(output.join(''), /container command failed/);
  });
  it('preserves exec argv and orders stop before restart', async () => {
    const app = f.load(); await app.start(); f.calls.length = 0;
    await app.restart();
    assert.deepEqual(f.calls[0][1], ['stop']);
    await app.exec('web', ['printf', '%s', 'a b;$HOME']);
    assert.deepEqual(f.calls.at(-1)[1], ['exec', '-T', 'web', 'printf', '%s', 'a b;$HOME']);
  });
  it('destroys only selected project storage and preserves source files and other products', async () => {
    const first = f.load(); const other = f.load({identity: 'other'});
    await first.start(); await other.start();
    await first.destroy();
    assert.equal(fs.existsSync(first._dir), false);
    assert.equal(fs.existsSync(first.cacheDir), false);
    assert.equal(fs.existsSync(other.stateFile), true);
    assert.equal(fs.existsSync(f.file), true);
    assert.equal(f.calls.at(-1)[2], first.project);
  });
  it('can destroy repeatedly without cached image metadata', async () => {
    const compose = f.engine.compose;
    f.engine.compose = async (project, file, ...args) => {
      assert.equal(yaml.load(fs.readFileSync(file, 'utf8')).services.web.image, `${project}-web:latest`);
      return compose.call(f.engine, project, file, ...args);
    };
    await f.load().start();
    await f.load().destroy();
    await f.load().destroy();
  });
});
