import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import mergePromise from '../utils/merge-promise.ts';

describe('utils/merge-promise', () => {
  it('should preserve deferred promise and event behavior', async () => {
    let invoked = 0;
    const emitter = new EventEmitter();
    const operation = mergePromise(emitter, async () => {
      invoked++;
      return 7;
    });
    assert.equal(invoked, 0);
    assert.equal(operation, emitter);
    let event = '';
    operation.on('progress', (value) => {
      event = value;
    });
    operation.emit('progress', 'working');
    assert.equal(event, 'working');
    assert.equal(await operation, 7);
    assert.equal(invoked, 1);
  });
});
