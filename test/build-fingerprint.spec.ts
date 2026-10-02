import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import requireValue from '../utils/require-value.ts';
import fingerprint from '../utils/build-fingerprint.ts';
import materialize from '../utils/materialize-asset.ts';
import { fixture } from '../utils/create-test-project.ts';

describe('utils/build-fingerprint', () => {
  it('invalidates relevant image fingerprints when materialized asset bytes or modes change', () => {
    const f = fixture();
    try {
      const source = path.join(f.temporary, 'embedded');
      const target = path.join(f.temporary, 'data', 'assets', 'boot.sh');
      fs.writeFileSync(source, 'first');
      materialize(source, target);
      const service = f.load().services[0];
      requireValue(service).addContext({ source: target, target: '/boot.sh' });
      const first = fingerprint(requireValue(service));
      fs.writeFileSync(source, 'second');
      materialize(source, target);
      const second = fingerprint(requireValue(service));
      assert.notEqual(second, first);
      assert.equal(fingerprint(requireValue(service)), second);
      fs.chmodSync(target, 0o644);
      assert.notEqual(fingerprint(requireValue(service)), second);
    } finally {
      f.cleanup();
    }
  });
});
