'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const appYaml = require('../components/yaml');
const {fixture} = require('./project-fixture');
const ports = require('../utils/parse-v4-ports');
const normalizeMounts = require('../utils/normalize-mounts');
const normalizeStorage = require('../utils/normalize-storage');

describe('L337 characterization (#3)', () => {
  let f;
  beforeEach(() => { f = fixture(); });
  afterEach(() => f.cleanup());
  const write = (f, service, extra = {}) => fs.writeFileSync(f.file, yaml.dump({services: {web: {type: 'l337', ...service}}, ...extra}));
  it('generates tagged, file and inline image inputs without Docker', () => {
    for (const input of ['alpine:3.20', 'FROM alpine:3.20\nRUN echo inline', 'Dockerfile']) {
      fs.writeFileSync(path.join(f.root, 'Dockerfile'), 'FROM alpine:3.20\nRUN echo file');
      write(f, {image: input});
      const app = f.load(); const context = app.services[0].generateBuildContext();
      assert.match(fs.readFileSync(context.imagefile, 'utf8'), /FROM alpine:3.20/);
    }
    assert.deepEqual(f.calls, []);
  });
  it('keeps imported image COPY context and relative nested !load/!import inputs', () => {
    const sub = path.join(f.root, 'sub'); fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'Dockerfile'), 'FROM alpine:3.20\nCOPY input /input\n');
    fs.writeFileSync(path.join(sub, 'input'), 'copied');
    fs.writeFileSync(path.join(sub, 'steps'), 'RUN echo imported\n');
    fs.writeFileSync(path.join(sub, 'service.yml'), 'type: l337\nimage:\n  imagefile: !import Dockerfile\n  steps:\n    - instructions: !load steps\n');
    fs.writeFileSync(f.file, 'services:\n  web: !load sub/service.yml\n');
    const app = f.load(); const context = app.services[0].generateBuildContext();
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /COPY input \/input/);
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /RUN echo imported/);
    assert.equal(context.sources.some(source => source.source === fs.realpathSync(sub)), true);
    assert.deepEqual(f.calls, []);
  });
  it('supports an imported single-line instruction and rejects missing imports', () => {
    fs.writeFileSync(path.join(f.root, 'instruction'), 'RUN echo hello');
    fs.writeFileSync(f.file, 'services:\n  web:\n    type: l337\n    image:\n      imagefile: alpine\n      steps:\n        - instructions: !load instruction\n');
    const context = f.load().services[0].generateBuildContext();
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /RUN echo hello/);
    assert.throws(() => appYaml.load('missing: !import absent', {base: f.root}), /cannot resolve|unknown tag/);
  });
  it('preserves build arguments and resolves compose build context from the app root', () => {
    fs.mkdirSync(path.join(f.root, 'build'));
    fs.writeFileSync(path.join(f.root, 'build', 'Dockerfile'), 'FROM alpine\n');
    write(f, {build: {context: './build', args: ['ZERO=0', 'URL=a=b']}});
    const context = f.load().services[0].generateBuildContext();
    assert.deepEqual(context.buildArgs, {ZERO: '0', URL: 'a=b'});
    assert.equal(context.sources[0].source, path.join(fs.realpathSync(f.root), 'build'));
  });
  it('retains explicit context sources, ownership, permissions and remote ADD inputs', () => {
    fs.writeFileSync(path.join(f.root, 'input'), 'hi');
    write(f, {image: {imagefile: 'alpine', context: [
      {src: 'input', dest: '/target', owner: 'root', perms: '0644'},
      {source: 'https://example.com/file', target: '/remote'},
    ]}});
    const context = f.load().services[0].generateBuildContext();
    const dockerfile = fs.readFileSync(context.imagefile, 'utf8');
    assert.match(dockerfile, /COPY --chown=root --chmod=0644 \/target \/target/);
    assert.match(dockerfile, /ADD https:\/\/example.com\/file \/remote/);
    assert.equal(context.sources.length, 1);
  });
  it('orders pre/post groups, hyphenated group names, users, zero weights and stages', () => {
    write(f, {image: {imagefile: 'alpine', groups: [
      {id: 'val-jean', weight: 20, user: 'nobody', stage: 'image'},
      {id: 'zero', weight: 0}, {id: 'later', stage: 'app'},
    ], steps: [
      {group: 'post-val-jean', instructions: 'RUN echo after'},
      {group: 'pre-val-jean', instructions: 'RUN echo before'},
      {group: 'val-jean', instructions: 'RUN echo middle'},
      {group: 'val-jean-2-before-nobody', instructions: 'RUN echo earlier'},
      {group: 'later', instructions: 'RUN echo not-image'},
      {group: 'unknown', instructions: 'RUN echo default'},
    ]}});
    const service = f.load().services[0];
    const steps = service.getSteps('image').sort((a, b) => a.weight - b.weight);
    assert.deepEqual(steps.map(step => step.weight), [18, 19, 20, 21, 1000]);
    assert.deepEqual(steps.map(step => step.user), ['nobody', 'root', 'nobody', 'root', 'root']);
    assert.equal(service._data.groups.zero.weight, 0);
    const text = fs.readFileSync(service.generateBuildContext().imagefile, 'utf8');
    assert.ok(text.indexOf('RUN echo before') < text.indexOf('RUN echo middle'));
    assert.ok(text.indexOf('RUN echo middle') < text.indexOf('RUN echo after'));
    assert.equal(text.includes('RUN echo not-image'), false);
  });
  it('normalizes HTTP ports and retains long syntax', () => {
    const result = ports(['8080:80/http', '8443:443/https', '9000-9002/tcp', {target: 53, published: '5353', protocol: 'udp'}]);
    assert.deepEqual(result.http, [80]); assert.deepEqual(result.https, [443]);
    assert.equal(result.ports[0], '8080:80/tcp'); assert.equal(result.ports[3].protocol, 'udp');
  });
  it('preserves existing files, no-create binds, named volumes and VM host-service paths', () => {
    const existing = path.join(f.root, 'existing'); fs.writeFileSync(existing, 'keep');
    write(f, {image: 'alpine', volumes: [
      './existing:/file:ro', 'storage:/storage',
      {type: 'bind', source: './absent', target: '/absent', bind: {create_host_path: false}},
      {type: 'bind', source: '/run/host-services/ssh-auth.sock', target: '/agent'},
      './created:/created',
    ]}, {volumes: {storage: {}}});
    const app = f.load(); const mounts = app.assemble().services.web.volumes;
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(f.root, 'absent')), false);
    assert.equal(fs.statSync(path.join(f.root, 'created')).isDirectory(), true);
    assert.equal(mounts[0].read_only, true); assert.equal(mounts[1].type, 'volume');
    assert.equal(mounts[3].source, '/run/host-services/ssh-auth.sock');
  });
  it('retains mount exclusions and scoped storage normalization', () => {
    const service = f.load().services[0]; service.user = {name: 'root'};
    const mounts = normalizeMounts([{type: 'bind', source: f.root, target: '/app', excludes: ['node_modules', '!input']}], service);
    assert.equal(mounts[1].type, 'storage:volume');
    assert.equal(mounts[2].type, 'storage:bind');
    const volumes = normalizeStorage(['/data'], service);
    assert.equal(volumes[0].source, `${service.project}-web-data`);
    assert.equal(volumes[0].labels['dev.lando.storage-project'], service.project);
  });
});
