import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from './read-yaml.ts';
import { runCli } from '../lib/cli.ts';
import { createDevtool } from '../lib/devtool.ts';
import { fixture } from './project-fixture.ts';

describe('L337 lifecycle (#4)', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.cleanup());
  it('builds sequentially before compose and persists only completed startup', async () => {
    fs.writeFileSync(
      f.file,
      'services:\n  one: {type: l337, image: alpine}\n  two: {type: l337, image: alpine}\n',
    );
    const app = f.load();
    await app.start();
    assert.deepEqual(
      f.calls.map((call) => call[0]),
      ['build', 'inspect', 'build', 'inspect', 'compose'],
    );
    assert.equal(JSON.parse(fs.readFileSync(app.stateFile, 'utf8')).running, true);
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
    assert.equal(Object.hasOwn(app.getInfo().services[0].state, 'APP'), false);
    await app.start();
    assert.equal(
      f.calls.some((call) => call[0] === 'build'),
      false,
    );
    assert.equal(
      yaml.load(fs.readFileSync(app.composeFile, 'utf8')).services.web.image,
      `${app.project}-web:latest`,
    );
  });
  it('preserves custom image tags through build, cached reload, rebuild and recovery', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: { type: 'l337', image: { imagefile: 'alpine', tag: 'fixture:custom' } },
          compose: { type: 'l337', image: 'fixture:compose', build: { dockerfile: 'Dockerfile' } },
        },
      }),
    );
    fs.writeFileSync(path.join(f.root, 'Dockerfile'), 'FROM alpine\n');
    const check = (app: ReturnType<typeof f.load>) => {
      assert.equal(app.state.services.web.tag, 'fixture:custom');
      assert.equal(app.state.services.compose.tag, 'fixture:compose');
      assert.equal(app.assemble().services!.web.image, 'fixture:custom');
      assert.equal(app.assemble().services!.compose.image, 'fixture:compose');
    };
    let app = f.load();
    await app.start();
    check(app);
    f.calls.length = 0;
    app = f.load();
    await app.start();
    check(app);
    assert.equal(f.calls.filter((call) => call[0] === 'build').length, 0);
    await app.rebuild();
    check(app);
    f.engine.buildError = new Error('failed build');
    await assert.rejects(app.rebuild(), /failed build/);
    delete f.engine.buildError;
    await app.start();
    check(app);
  });
  it('maps exec cwd into the app bind without overriding explicit or image workdirs', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: { type: 'l337', image: 'alpine', volumes: ['./:/site'] },
          explicit: { type: 'l337', image: 'alpine', volumes: ['./:/site'], working_dir: '/tmp' },
          fallback: { type: 'l337', image: 'alpine' },
        },
      }),
    );
    fs.mkdirSync(path.join(f.root, 'folder'));
    for (let iteration = 0; iteration < 2; iteration++) {
      const app = f.load();
      await app.start();
      await app.exec('web', ['pwd'], { cwd: path.join(f.root, 'folder') });
      assert.deepEqual(f.calls.at(-1)![1], [
        'exec',
        '-T',
        '--workdir',
        '/site/folder',
        'web',
        'pwd',
      ]);
      await app.exec('web', ['pwd'], { cwd: f.temporary });
      assert.deepEqual(f.calls.at(-1)![1], ['exec', '-T', '--workdir', '/site', 'web', 'pwd']);
      for (const service of ['explicit', 'fallback']) {
        await app.exec(service, ['pwd'], { cwd: path.join(f.root, 'folder') });
        assert.deepEqual(f.calls.at(-1)![1], ['exec', '-T', service, 'pwd']);
      }
    }
  });
  it('rebuilds for changed configuration, missing images and explicit rebuild', async () => {
    await f.load().start();
    fs.appendFileSync(f.file, '\n');
    let app = f.load();
    await app.start();
    assert.equal(f.calls.filter((call) => call[0] === 'build').length, 1);
    const data = yaml.load(fs.readFileSync(f.file, 'utf8'));
    data.services.web.environment = { CHANGED: 'yes' };
    fs.writeFileSync(f.file, yaml.dump(data));
    await f.load().start();
    f.images.clear();
    await f.load().start();
    app = f.load();
    await app.rebuild();
    assert.equal(f.calls.filter((call) => call[0] === 'build').length, 4);
  });
  it('invalidates builds when copied file contents change', async () => {
    fs.writeFileSync(path.join(f.root, 'input'), 'before');
    fs.writeFileSync(
      f.file,
      'services:\n  web:\n    type: l337\n    image:\n      imagefile: alpine\n      context: [input:/input]\n',
    );
    await f.load().start();
    await f.load().start();
    assert.equal(f.calls.filter((call) => call[0] === 'build').length, 1);
    fs.writeFileSync(path.join(f.root, 'input'), 'after');
    await f.load().start();
    assert.equal(f.calls.filter((call) => call[0] === 'build').length, 2);
  });
  it('never starts containers or leaves successful state after a build failure', async () => {
    const app = f.load();
    await app.start();
    f.calls.length = 0;
    f.engine.buildError = Object.assign(new Error('broken build'), { code: 23 });
    await assert.rejects(app.rebuild(), /broken build/);
    assert.equal(
      f.calls.some((call) => call[0] === 'compose'),
      false,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(app.stateFile, 'utf8')).services, {});
    assert.equal(app.state.running, false);
  });
  it('propagates startup and exec failure status through the CLI', async () => {
    f.engine.commandError = Object.assign(new Error('container command failed'), { code: 17 });
    const output: (string | Uint8Array)[] = [];
    const stream = { write: (text: string | Uint8Array) => output.push(text) };
    const runtime = createDevtool(f.options);
    assert.equal(
      await runCli(['start'], { runtime, cwd: f.root, stdout: stream, stderr: stream }),
      17,
    );
    assert.equal(f.load().state.running, false);
    assert.equal(
      await runCli(['exec', 'web', '--', 'sh', '-c', 'exit 17'], {
        runtime,
        cwd: f.root,
        stdout: stream,
        stderr: stream,
      }),
      17,
    );
    assert.match(output.join(''), /container command failed/);
  });
  it('preserves exec argv and orders stop before restart', async () => {
    const app = f.load();
    await app.start();
    f.calls.length = 0;
    await app.restart();
    assert.deepEqual(f.calls[0][1], ['stop']);
    await app.exec('web', ['printf', '%s', 'a b;$HOME']);
    assert.deepEqual(f.calls.at(-1)![1], ['exec', '-T', 'web', 'printf', '%s', 'a b;$HOME']);
  });
  it('destroys only selected project storage and preserves source files and other products', async () => {
    const first = f.load();
    const other = f.load({ identity: 'other' });
    await first.start();
    await other.start();
    await first.destroy();
    assert.equal(fs.existsSync(first._dir), false);
    assert.equal(fs.existsSync(first.cacheDir), false);
    assert.equal(fs.existsSync(other.stateFile), true);
    assert.equal(fs.existsSync(f.file), true);
    assert.equal(f.calls.at(-1)![2], first.project);
  });
  it('can destroy repeatedly without cached image metadata', async () => {
    const compose = f.engine.compose;
    f.engine.compose = async (project, file, ...args) => {
      assert.equal(
        yaml.load(fs.readFileSync(file, 'utf8')).services.web.image,
        `${project}-web:latest`,
      );
      return compose.call(f.engine, project, file, ...args);
    };
    await f.load().start();
    await f.load().destroy();
    await f.load().destroy();
  });
});
