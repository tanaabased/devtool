import assert from 'node:assert/strict';
import requireValue from '../../../utils/require-value.ts';
import { fixture } from '../../../utils/create-test-project.ts';
import normalizeMounts from '../utils/normalize-mounts.ts';
describe('Lando mount normalization', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.cleanup());
  it('should retain mount exclusions', () => {
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
  });
});
