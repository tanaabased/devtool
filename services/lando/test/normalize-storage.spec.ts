import assert from 'node:assert/strict';
import { fixture } from '../../../utils/create-test-project.ts';
import requireValue from '../../../utils/require-value.ts';
import normalize from '../utils/normalize-storage.ts';

describe('services/lando/utils/normalize-storage', () => {
  it('should scope generated names and preserve explicitly named storage', () => {
    const f = fixture();
    try {
      const service = Object.assign(requireValue(f.load().services[0]), {
        user: { name: 'root', uid: 0, gid: 0 },
        storageNamespace: 'fixture',
      });
      const [local, global, existing] = normalize(
        [
          '/data',
          { target: '/shared', scope: 'global' },
          { source: 'existing', target: '/existing' },
        ],
        service,
      );
      assert.equal(requireValue(local).source, `${service.project}-web-data`);
      assert.equal(requireValue(local).labels!['dev.lando.storage-project'], service.project);
      assert.equal(requireValue(global).source, 'fixture-shared');
      assert.equal(requireValue(global).labels!['dev.lando.storage-project'], undefined);
      assert.equal(requireValue(existing).source, 'existing');
      assert.deepEqual(requireValue(existing).labels, {});
      assert.throws(
        () => normalize([{ target: '/bad', scope: 'invalid' }], service),
        /Unsupported storage scope/,
      );
    } finally {
      f.cleanup();
    }
  });
});
