import assert from 'node:assert/strict';
import { runCli } from '../lib/cli.ts';
import { createDevtool, version } from '@tanaab/devtool';

describe('CLI information and errors', () => {
  const invoke = async (args: string[]) => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(args, {
      product: createDevtool({ env: {} }),
      cwd: '/nonexistent-devtool-project',
      stdout: {
        write: (value) => {
          stdout += value;
          return true;
        },
      },
      stderr: {
        write: (value) => {
          stderr += value;
          return true;
        },
      },
    });
    return { code, stdout, stderr };
  };
  it('should show help and version through their aliases', async () => {
    for (const args of [[], ['--help'], ['-h']]) {
      const result = await invoke(args);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Usage:/);
    }
    for (const flag of ['--version', '-v']) {
      assert.deepEqual(await invoke([flag]), { code: 0, stdout: `${version}\n`, stderr: '' });
    }
  });
  it('should reject missing app files and unknown options', async () => {
    for (const args of [['start'], ['--unknown']]) {
      const result = await invoke(args);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /error:/);
      assert.match(result.stderr, /Run devtool --help/);
    }
  });
});
