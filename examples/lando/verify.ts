const cacheRoot = process.env.DEVTOOL_CACHE_ROOT;
assert.ok(cacheRoot, 'Missing DEVTOOL_CACHE_ROOT');
const dataRoot = process.env.DEVTOOL_DATA_ROOT;
assert.ok(dataRoot, 'Missing DEVTOOL_DATA_ROOT');
const fixtureRoot = process.env.DEVTOOL_FIXTURE_ROOT;
assert.ok(fixtureRoot, 'Missing DEVTOOL_FIXTURE_ROOT');
import type { AppInfo } from '../../lib/types.ts';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import * as yaml from '../../utils/read-fixture-yaml.ts';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Container assertions run only in disposable CI');
const root = path.join(fixtureRoot, 'lando');
const file = path.join(root, '.devtool.yml');
const cli = (...args: string[]) => {
  const result = spawnSync('devtool', ['--file', file, ...args], {
    encoding: 'utf8',
    timeout: 240000,
  });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};
const exec = (service: string, ...args: string[]) => cli('exec', service, '--', ...args);
const info = (): AppInfo => JSON.parse(cli('info', '--json'));
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const snapshot = path.join(root, 'snapshot.json');
const project = () => info().project;
const state = () =>
  JSON.parse(fs.readFileSync(path.join(cacheRoot, 'projects', project(), 'state.json'), 'utf8'));
const original = path.join(root, 'before-image-failure.yml');
switch (process.argv[2]) {
  case 'setup':
    assert.ok(fixtureRoot);
    fs.mkdirSync(root, { recursive: true });
    for (const name of ['.devtool.yml', 'readonly', 'copied', 'app.sh'])
      fs.copyFileSync(path.join(import.meta.dirname, name), path.join(root, name));
    fs.chmodSync(path.join(root, 'app.sh'), 0o755);
    break;
  case 'state':
    assert.equal(info().services.find((service) => service.service === 'web')!.healthy, true);
    assert.equal(
      info().services.every(
        (service) => service.state.IMAGE === 'BUILT' && service.state.APP === 'BUILT',
      ),
      true,
    );
    break;
  case 'entrypoint':
    for (let i = 0; i < 30 && !fs.existsSync(path.join(root, 'entrypoint-proof')); i++)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    assert.equal(fs.readFileSync(path.join(root, 'entrypoint-proof'), 'utf8').trim(), 'entrypoint');
    break;
  case 'certificates': {
    const cert = new X509Certificate(exec('web', 'cat', '/etc/lando/certs/cert.crt'));
    const caFile = path.join(dataRoot, 'projects', project(), 'certs', 'ca.crt');
    assert.ok(cert.checkHost(`web.${project()}.internal`));
    assert.ok(cert.verify(new X509Certificate(fs.readFileSync(caFile)).publicKey));
    assert.ok(
      exec('web', 'cat', '/etc/ssl/certs/ca-certificates.crt').includes(
        fs.readFileSync(caFile, 'utf8').trim(),
      ),
    );
    break;
  }
  case 'snapshot':
    fs.writeFileSync(
      snapshot,
      JSON.stringify({
        image: docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'),
        state: state(),
        project: project(),
      }),
    );
    break;
  case 'cached':
    assert.equal(
      docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'),
      JSON.parse(fs.readFileSync(snapshot, 'utf8')).image,
    );
    break;
  case 'failed':
    assert.deepEqual(state().services, {});
    assert.equal(state().running, false);
    break;
  case 'break-image': {
    fs.copyFileSync(file, original);
    const data = yaml.load(fs.readFileSync(file, 'utf8'));
    assert.ok(data.services.web);
    data.services.web.build.image = 'exit 23';
    fs.writeFileSync(file, yaml.dump(data));
    break;
  }
  case 'restore-image':
    fs.copyFileSync(original, file);
    fs.unlinkSync(original);
    break;
  case 'destroyed': {
    const id = JSON.parse(fs.readFileSync(snapshot, 'utf8')).project;
    assert.equal(docker('ps', '-aq', '--filter', `label=com.docker.compose.project=${id}`), '');
    assert.equal(
      docker('volume', 'ls', '-q', '--filter', `label=dev.lando.storage-project=${id}`),
      '',
    );
    assert.ok(fs.existsSync(file));
    assert.equal(fs.existsSync(path.join(cacheRoot, 'projects', id)), false);
    const globals = docker('volume', 'ls', '-q', '--filter', 'label=dev.lando.storage-scope=global')
      .split('\n')
      .filter(Boolean);
    assert.ok(globals.length > 0);
    break;
  }
  default:
    throw new Error('Unknown Lando assertion');
}
process.stdout.write(`Lando assertion passed: ${process.argv[2]}\n`);
