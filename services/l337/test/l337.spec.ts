import requireValue from '../../../utils/require-value.ts';
import type { ServiceConfig, Mount } from '../../../components/service.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import appYaml from '../../../lib/yaml.ts';
import { fixture } from '../../../utils/create-test-project.ts';
import { createDevtool } from '../../../lib/devtool.ts';

describe('L337 characterization (#3)', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.cleanup());
  const write = (f: ReturnType<typeof fixture>, service: ServiceConfig, extra = {}) =>
    fs.writeFileSync(
      f.file,
      yaml.dump({ services: { web: { type: 'l337', ...service } }, ...extra }),
    );
  it('resolves all restored fixture imports and local build sources without Docker', () => {
    const app = createDevtool(f.options).loadApp({
      file: path.resolve(import.meta.dirname, '../../../examples/l337/.devtool.yml'),
    });
    assert.equal(app.services.length, 16);
    for (const service of app.services) {
      const context = service.generateBuildContext();
      assert.ok(fs.existsSync(context.imagefile), service.id);
      for (const source of context.sources) assert.ok(fs.existsSync(source.source), source.source);
    }
    assert.deepEqual(f.calls, []);
  });
  it('generates tagged, file and inline image inputs without Docker', () => {
    for (const input of ['alpine:3.20', 'FROM alpine:3.20\nRUN echo inline', 'Dockerfile']) {
      fs.writeFileSync(path.join(f.root, 'Dockerfile'), 'FROM alpine:3.20\nRUN echo file');
      write(f, { image: input });
      const app = f.load();
      const context = requireValue(app.services[0]).generateBuildContext();
      assert.match(fs.readFileSync(context.imagefile, 'utf8'), /FROM alpine:3.20/);
    }
    assert.deepEqual(f.calls, []);
  });
  it('keeps imported image COPY context and relative nested !load/!import inputs', () => {
    const sub = path.join(f.root, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'Dockerfile'), 'FROM alpine:3.20\nCOPY input /input\n');
    fs.writeFileSync(path.join(sub, 'input'), 'copied');
    fs.writeFileSync(path.join(sub, 'steps'), 'RUN echo imported\n');
    fs.writeFileSync(
      path.join(sub, 'service.yml'),
      'type: l337\nimage:\n  imagefile: !import Dockerfile\n  steps:\n    - instructions: !load steps\n',
    );
    fs.writeFileSync(f.file, 'services:\n  web: !load sub/service.yml\n');
    const app = f.load();
    const context = requireValue(app.services[0]).generateBuildContext();
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /COPY input \/input/);
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /RUN echo imported/);
    assert.equal(
      context.sources.some((source) => source.source === fs.realpathSync(sub)),
      true,
    );
    assert.deepEqual(f.calls, []);
  });
  it('supports an imported single-line instruction and rejects missing imports', () => {
    fs.writeFileSync(path.join(f.root, 'instruction'), 'RUN echo hello');
    fs.writeFileSync(
      f.file,
      'services:\n  web:\n    type: l337\n    image:\n      imagefile: alpine\n      steps:\n        - instructions: !load instruction\n',
    );
    const context = requireValue(f.load().services[0]).generateBuildContext();
    assert.match(fs.readFileSync(context.imagefile, 'utf8'), /RUN echo hello/);
    assert.throws(
      () => appYaml.load('missing: !import absent', { base: f.root }),
      /cannot resolve|unknown tag/,
    );
  });
  it('preserves build arguments and resolves compose build context from the app root', () => {
    fs.mkdirSync(path.join(f.root, 'build'));
    fs.writeFileSync(path.join(f.root, 'build', 'Dockerfile'), 'FROM alpine\n');
    write(f, { build: { context: './build', args: ['ZERO=0', 'URL=a=b'] } });
    const context = requireValue(f.load().services[0]).generateBuildContext();
    assert.deepEqual(context.buildArgs, { ZERO: '0', URL: 'a=b' });
    assert.equal(
      requireValue(context.sources[0]).source,
      path.join(fs.realpathSync(f.root), 'build'),
    );
  });
  it('ignores empty and valueless build arguments while retaining zero and equals signs', () => {
    write(f, {
      image: { imagefile: 'alpine', args: ['ZERO=0', 'URL=a=b', ' missing ', '', '=bad', null] },
    });
    assert.deepEqual(requireValue(f.load().services[0]).buildArgs, { ZERO: '0', URL: 'a=b' });
  });
  it('retains explicit context sources, ownership, permissions and remote ADD inputs', () => {
    fs.writeFileSync(path.join(f.root, 'input'), 'hi');
    write(f, {
      image: {
        imagefile: 'alpine',
        context: [
          { src: 'input', dest: '/target', owner: 'root', perms: '0644' },
          { source: 'https://example.com/file', target: '/remote' },
        ],
      },
    });
    const context = requireValue(f.load().services[0]).generateBuildContext();
    const dockerfile = fs.readFileSync(context.imagefile, 'utf8');
    assert.match(dockerfile, /COPY --chown=root --chmod=0644 \/target \/target/);
    assert.match(dockerfile, /ADD https:\/\/example.com\/file \/remote/);
    assert.equal(context.sources.length, 1);
  });
  it('orders pre/post groups, hyphenated group names, users, zero weights and stages', () => {
    write(f, {
      image: {
        imagefile: 'alpine',
        groups: [
          { id: 'val-jean', weight: 20, user: 'nobody', stage: 'image' },
          { id: 'zero', weight: 0 },
          { id: 'later', stage: 'app' },
        ],
        steps: [
          { group: 'post-val-jean', instructions: 'RUN echo after' },
          { group: 'pre-val-jean', instructions: 'RUN echo before' },
          { group: 'val-jean', instructions: 'RUN echo middle' },
          { group: 'val-jean-2-before-nobody', instructions: 'RUN echo earlier' },
          { group: 'later', instructions: 'RUN echo not-image' },
          { group: 'unknown', instructions: 'RUN echo default' },
        ],
      },
    });
    const service = f.load().services[0];
    const steps = requireValue(service)
      .getSteps('image')
      .sort((a, b) => a.weight - b.weight);
    assert.deepEqual(
      steps.map((step) => step.weight),
      [18, 19, 20, 21, 1000],
    );
    assert.deepEqual(
      steps.map((step) => step.user),
      ['nobody', 'root', 'nobody', 'root', 'root'],
    );
    assert.equal(requireValue(requireValue(service)._data.groups.zero).weight, 0);
    const text = fs.readFileSync(requireValue(service).generateBuildContext().imagefile, 'utf8');
    assert.ok(text.indexOf('RUN echo before') < text.indexOf('RUN echo middle'));
    assert.ok(text.indexOf('RUN echo middle') < text.indexOf('RUN echo after'));
    assert.equal(text.includes('RUN echo not-image'), false);
  });
  it('preserves explicit working directories and reports the mounted app location', () => {
    write(f, { image: 'alpine', working_dir: '/site/subdirectory', volumes: ['./:/site'] });
    const app = f.load();
    assert.equal(requireValue(app.assemble().services!.web).working_dir, '/site/subdirectory');
    assert.equal(requireValue(app.getInfo().services[0]).appMount, '/site');
  });
  it('preserves existing files, no-create binds, named volumes and VM host-service paths', () => {
    const existing = path.join(f.root, 'existing');
    fs.writeFileSync(existing, 'keep');
    write(
      f,
      {
        image: 'alpine',
        volumes: [
          './existing:/file:ro',
          'storage:/storage',
          {
            type: 'bind',
            source: './absent',
            target: '/absent',
            bind: { create_host_path: false },
          },
          { type: 'bind', source: '/run/host-services/ssh-auth.sock', target: '/agent' },
          './created:/created',
        ],
      },
      { volumes: { storage: {} } },
    );
    const app = f.load();
    const mounts = requireValue(app.assemble().services!.web).volumes as Mount[];
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(f.root, 'absent')), false);
    assert.equal(fs.statSync(path.join(f.root, 'created')).isDirectory(), true);
    assert.equal(requireValue(mounts[0]).read_only, true);
    assert.equal(requireValue(mounts[1]).type, 'volume');
    assert.equal(requireValue(mounts[3]).source, '/run/host-services/ssh-auth.sock');
  });
});
