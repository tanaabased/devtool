import assert from 'node:assert/strict';
import asError from '../../../utils/as-error.ts';
import execute from '../utils/execute.ts';

describe('engines/docker/utils/execute', () => {
  it('preserves arguments without shell expansion and propagates child status', async () => {
    const result = await execute(process.execPath, [
      '-e',
      'console.log(process.argv[1])',
      'a b;$HOME',
    ]);
    assert.equal(result.stdout.trim(), 'a b;$HOME');
    await assert.rejects(
      execute(process.execPath, ['-e', 'console.error("failed");process.exit(17)']),
      (error) => asError(error).code === 17 && /failed/.test(asError(error).message),
    );
    await assert.rejects(execute(import.meta.filename + '.missing', []), /Unable to run/);
  });
  it('keeps full capture by default and bounds tail capture without truncating streamed output', async () => {
    const output = 'out-'.repeat(32768) + 'stdout-end';
    const diagnostic = 'err-'.repeat(32768) + 'stderr-end';
    for (const capture of [undefined, 'tail'] as const) {
      for (const code of [0, 17]) {
        let stdout = '';
        let stderr = '';
        const result = await execute(
          process.execPath,
          [
            '-e',
            `process.stdout.write('out-'.repeat(32768) + 'stdout-end');
             process.stderr.write('err-'.repeat(32768) + 'stderr-end');
             process.exitCode = ${code};`,
          ],
          {
            capture,
            stdout: { write: (chunk) => (stdout += chunk) },
            stderr: { write: (chunk) => (stderr += chunk) },
          },
        ).catch((error) => {
          assert.equal(code, 17);
          return asError(error);
        });
        assert.equal(result.code, code);
        assert.equal(stdout, output);
        assert.equal(stderr, diagnostic);
        assert.equal(result.stdout, capture === 'tail' ? output.slice(-8192) : output);
        assert.equal(result.stderr, capture === 'tail' ? diagnostic.slice(-8192) : diagnostic);
        if (code === 17) {
          assert.ok(result instanceof Error);
          assert.ok(result.message.endsWith(result.stderr!));
        }
      }
    }
  });
  it('retains a bounded stdout diagnostic when a failing command has no stderr', async () => {
    await assert.rejects(
      execute(
        process.execPath,
        ['-e', "process.stdout.write('x'.repeat(32768) + 'failure-end'); process.exitCode = 23;"],
        { capture: 'tail' },
      ),
      (caught) => {
        const error = asError(caught);
        assert.equal(error.code, 23);
        assert.equal(error.stderr, '');
        assert.equal(error.stdout?.length, 8192);
        assert.ok(error.message.endsWith(error.stdout!));
        assert.ok(error.message.endsWith('failure-end'));
        return true;
      },
    );
  });
});
