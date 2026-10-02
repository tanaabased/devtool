import assert from 'node:assert/strict';
import merge from '../utils/merge-compose.ts';
import requireValue from '../utils/require-value.ts';

describe('merge Compose contributions', () => {
  it('replaces ordinary arrays and same-target mounts while retaining unrelated mounts', () => {
    const first = {
      services: {
        web: {
          command: ['old'],
          environment: { A: 'one' },
          volumes: [
            { source: 'a', target: '/a' },
            { source: 'b', target: '/b' },
          ],
        },
      },
    };
    const result = merge([
      {
        data: [
          first,
          {
            services: {
              web: {
                command: ['new'],
                environment: { B: 'two' },
                volumes: [{ source: 'new', target: '/a' }],
              },
            },
          },
        ],
      },
    ]);
    const web = requireValue(result.services?.web);
    assert.deepEqual(web.command, ['new']);
    assert.deepEqual(web.environment, { A: 'one', B: 'two' });
    assert.deepEqual(web.volumes, [
      { source: 'new', target: '/a' },
      { source: 'b', target: '/b' },
    ]);
    assert.deepEqual(first.services.web.command, ['old']);
    assert.equal(first.services.web.volumes[0]?.source, 'a');
    assert.deepEqual(merge([]), {});
  });
});
