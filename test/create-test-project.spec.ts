import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../utils/create-test-project.ts';

describe('utils/create-test-project', () => {
  it('should isolate fake engine state and cleanup between projects', async () => {
    const first = fixture();
    const second = fixture();
    try {
      await first.engine.createVolume({ Name: 'owned', Labels: {} });
      assert.equal((await first.engine.listVolumes()).Volumes?.length, 1);
      assert.equal((await second.engine.listVolumes()).Volumes?.length, 0);
      first.engine.commandError = new Error('injected failure');
      await assert.rejects(first.engine.compose('project', 'file', ['up']), /injected failure/);
      assert.equal((await second.engine.compose('project', 'file', ['up'])).code, 0);
      first.cleanup();
      assert.equal(fs.existsSync(first.temporary), false);
      assert.equal(fs.existsSync(second.file), true);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });
});
