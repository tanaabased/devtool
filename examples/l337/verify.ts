import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cacheRoot = process.env.DEVTOOL_CACHE_ROOT;
assert.ok(cacheRoot, 'Missing DEVTOOL_CACHE_ROOT');
const dataRoot = process.env.DEVTOOL_DATA_ROOT;
assert.ok(dataRoot, 'Missing DEVTOOL_DATA_ROOT');
const root = path.resolve('.results');
interface Info {
  project: string;
  running: boolean;
  services: {
    service: string;
    api: number;
    type: string;
    primary: boolean;
    user: string;
    appMount?: string;
    image: string;
    tag?: string;
    state: { IMAGE: string };
  }[];
}
const info: Info = JSON.parse(fs.readFileSync(path.join(root, 'info.json'), 'utf8'));
const stateFile = path.join(cacheRoot, 'projects', info.project, 'state.json');
const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const tags = () =>
  Object.fromEntries(info.services.map((service) => [service.service, service.tag]));
const images = () =>
  Object.fromEntries(
    info.services.map((service) => [
      service.service,
      docker(['image', 'inspect', service.tag!, '--format', '{{.Id}}']),
    ]),
  );
const containers = (all = false) =>
  docker([
    'ps',
    ...(all ? ['--all'] : []),
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${info.project}`,
  ])
    .split('\n')
    .filter(Boolean);
const snapshot = path.join(root, 'snapshot.json');

switch (process.argv[2]) {
  case 'unbuilt': {
    assert.equal(info.running, false);
    assert.equal(info.services.length, 16);
    for (const service of info.services) {
      assert.equal(service.api, 4);
      assert.equal(service.type, 'l337');
      assert.equal(service.state.IMAGE, 'UNBUILT');
      assert.equal(service.primary, service.service === 'web');
      assert.equal(service.user, service.service === 'web' ? 'nginx' : 'root');
    }
    assert.equal(info.services.find((service) => service.service === 'web')!.appMount, '/site');
    assert.equal(
      info.services.find((service) => service.service === 'image-1')!.image,
      'nginx:1.21.6',
    );
    assert.equal(
      info.services.find((service) => service.service === 'image-4')!.image,
      'nginx:1.21.5',
    );
    for (const id of ['db', 'web', 'image-2', 'image-3', 'image-5', 'image-6']) {
      const image = info.services.find((service) => service.service === id)!.image;
      assert.ok(path.isAbsolute(image));
      assert.match(fs.readFileSync(image, 'utf8'), /FROM /);
    }
    break;
  }
  case 'info':
    assert.equal(info.running, true);
    assert.equal(info.services.length, 16);
    for (const service of info.services) {
      assert.equal(service.state.IMAGE, 'BUILT');
      assert.equal(
        service.tag,
        service.service === 'image-4'
          ? 'devtool-l337-image-4:coverage'
          : `${info.project}-${service.service}:latest`,
      );
    }
    assert.equal(containers().length, 16);
    break;
  case 'resources': {
    const inspected = JSON.parse(docker(['inspect', ...containers()]));
    const web = inspected.find(
      (container: { Config: { Labels: Record<string, string> } }) =>
        container.Config.Labels['com.docker.compose.service'] === 'web',
    );
    assert.equal(web.Config.Labels['dev.lando.http-ports'], '8888');
    assert.equal(web.Config.Labels['dev.lando.https-ports'], '');
    const readonly = web.Mounts.find(
      (mount: { Destination: string }) => mount.Destination === '/file-ro',
    );
    assert.equal(readonly.RW, false);
    const long = web.Mounts.find(
      (mount: { Destination: string }) => mount.Destination === '/file-long',
    );
    assert.equal(long.RW, false);
    assert.equal(long.Source, readonly.Source);
    assert.equal(readonly.Type, 'bind');
    assert.equal(fs.realpathSync(readonly.Source), fs.realpathSync('inputs/file1'));
    const network = JSON.parse(docker(['network', 'inspect', `${info.project}_my-network`]))[0];
    assert.equal(network.Labels['com.docker.compose.project'], info.project);
    assert.equal(Object.keys(network.Containers).length, 1);
    const volume = JSON.parse(docker(['volume', 'inspect', `${info.project}_my-data`]))[0];
    assert.equal(volume.Labels['com.docker.compose.project'], info.project);
    break;
  }
  case 'snapshot':
    fs.writeFileSync(snapshot, JSON.stringify({ images: images(), state: state() }));
    break;
  case 'reused': {
    const previous = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
    assert.deepEqual(images(), previous.images);
    for (const id of Object.keys(tags())) {
      assert.equal(state().services[id].fingerprint, previous.state.services[id].fingerprint);
    }
    break;
  }
  case 'stopped':
    assert.equal(containers().length, 0);
    break;
  case 'changed': {
    const previous = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
    assert.notEqual(images().web, previous.images.web);
    assert.notEqual(state().services.web.fingerprint, previous.state.services.web.fingerprint);
    break;
  }
  case 'failed':
    assert.deepEqual(state().services, {});
    assert.equal(state().running, false);
    break;
  case 'destroyed':
    assert.equal(containers(true).length, 0);
    assert.equal(
      docker([
        'network',
        'ls',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${info.project}`,
      ]),
      '',
    );
    assert.equal(
      docker([
        'volume',
        'ls',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${info.project}`,
      ]),
      '',
    );
    assert.equal(fs.existsSync(stateFile), false);
    assert.equal(fs.existsSync(path.join(dataRoot, 'projects', info.project)), false);
    assert.equal(fs.existsSync(path.resolve('.devtool.yml')), true);
    break;
  default:
    throw new Error('Unknown lifecycle assertion');
}
