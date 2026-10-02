import assert from 'node:assert/strict';
import requireValue from '../../../test/require-value.ts';
import { fixture } from '../../../test/project-fixture.ts';
import normalizeMounts from '../utils/normalize-mounts.ts';
import normalizeStorage from '../utils/normalize-storage.ts';
describe('Lando mount and storage normalization', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.cleanup());
  it('retains mount exclusions and scoped storage normalization', () => {
    const service = Object.assign(requireValue(f.load().services[0]), {
      user: { name: 'root', uid: 0, gid: 0 },
      storageNamespace: 'fixture',
    });
    const mounts = normalizeMounts(
      [{ type: 'bind', source: f.root, target: '/app', excludes: ['node_modules', '!input'] }],
      service,
    );
    assert.equal(requireValue(mounts[1]).type, 'storage:volume');
    assert.equal(requireValue(mounts[2]).type, 'storage:bind');
    const volumes = normalizeStorage(['/data'], service);
    assert.equal(requireValue(volumes[0]).source, `${service.project}-web-data`);
    assert.equal(requireValue(volumes[0]).labels!['dev.lando.storage-project'], service.project);
  });
});
