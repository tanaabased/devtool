'use strict';
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {X509Certificate} = require('node:crypto');
const yaml = require('js-yaml');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Container assertions run only in disposable CI');
const root = path.join(process.env.DEVTOOL_FIXTURE_ROOT, 'lando');
const file = path.join(root, '.devtool.yml');
const cli = (...args) => {
  const result = spawnSync('devtool', ['--file', file, ...args], {encoding: 'utf8', timeout: 240000});
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};
const exec = (service, ...args) => cli('exec', service, '--', ...args);
const info = () => JSON.parse(cli('info', '--json'));
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8'}).trim();
const snapshot = path.join(root, 'snapshot.json');
const project = () => info().project;
const state = () => JSON.parse(fs.readFileSync(path.join(process.env.DEVTOOL_CACHE_ROOT, 'projects', project(), 'state.json')));
const original = path.join(root, 'before-image-failure.yml');
switch (process.argv[2]) {
  case 'setup':
    assert.ok(process.env.DEVTOOL_FIXTURE_ROOT);
    fs.mkdirSync(root, {recursive: true});
    for (const name of ['.devtool.yml', 'readonly', 'copied', 'app.sh']) fs.copyFileSync(path.join(__dirname, name), path.join(root, name));
    fs.chmodSync(path.join(root, 'app.sh'), 0o755);
    break;
  case 'state':
    assert.equal(info().services.find(service => service.service === 'web').healthy, true);
    assert.equal(info().services.every(service => service.state.IMAGE === 'BUILT' && service.state.APP === 'BUILT'), true);
    break;
  case 'entrypoint':
    for (let i = 0; i < 30 && !fs.existsSync(path.join(root, 'entrypoint-proof')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    assert.equal(fs.readFileSync(path.join(root, 'entrypoint-proof'), 'utf8').trim(), 'entrypoint');
    break;
  case 'certificates': {
    const cert = new X509Certificate(exec('web', 'cat', '/etc/lando/certs/cert.crt'));
    const caFile = path.join(process.env.DEVTOOL_DATA_ROOT, 'projects', project(), 'certs', 'ca.crt');
    assert.ok(cert.checkHost(`web.${project()}.internal`));
    assert.ok(cert.verify(new X509Certificate(fs.readFileSync(caFile)).publicKey));
    assert.ok(exec('web', 'cat', '/etc/ssl/certs/ca-certificates.crt').includes(fs.readFileSync(caFile, 'utf8').trim()));
    break;
  }
  case 'snapshot':
    fs.writeFileSync(snapshot, JSON.stringify({image: docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'), state: state(), project: project()}));
    break;
  case 'cached':
    assert.equal(docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'), JSON.parse(fs.readFileSync(snapshot)).image);
    break;
  case 'failed':
    assert.deepEqual(state().services, {});
    assert.equal(state().running, false);
    break;
  case 'break-image': {
    fs.copyFileSync(file, original);
    const data = yaml.load(fs.readFileSync(file, 'utf8'));
    data.services.web.build.image = 'exit 23';
    fs.writeFileSync(file, yaml.dump(data));
    break;
  }
  case 'restore-image':
    fs.copyFileSync(original, file);
    fs.unlinkSync(original);
    break;
  case 'destroyed': {
    const id = JSON.parse(fs.readFileSync(snapshot)).project;
    assert.equal(docker('ps', '-aq', '--filter', `label=com.docker.compose.project=${id}`), '');
    assert.equal(docker('volume', 'ls', '-q', '--filter', `label=dev.lando.storage-project=${id}`), '');
    assert.ok(fs.existsSync(file));
    assert.equal(fs.existsSync(path.join(process.env.DEVTOOL_CACHE_ROOT, 'projects', id)), false);
    const globals = docker('volume', 'ls', '-q', '--filter', 'label=dev.lando.storage-scope=global').split('\n').filter(Boolean);
    assert.ok(globals.length > 0);
    break;
  }
  default: throw new Error('Unknown Lando assertion');
}
console.log(`Lando assertion passed: ${process.argv[2]}`);
