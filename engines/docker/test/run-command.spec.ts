import assert from 'node:assert/strict';
import run from '../utils/run-command.ts';
import asError from '../../../utils/as-error.ts';

describe('builder command execution', () => {
  it('preserves argument boundaries and captures both streams', async () => {
    const result = await run(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1]);process.stderr.write("err")',
      'a;$HOME',
    ]);
    assert.deepEqual(result, { code: 0, stdout: 'a;$HOME', stderr: 'err' });
  });
  it('rejects failed launches and statuses unless explicitly ignored', async () => {
    await assert.rejects(run('/nonexistent/devtool-command'), /ENOENT/);
    await assert.rejects(
      run(process.execPath, ['-e', 'console.error("bad");process.exit(9)']),
      (error) => asError(error).code === 9,
    );
    const result = await run(process.execPath, ['-e', 'process.exit(9)'], {
      ignoreReturnCode: true,
    });
    assert.equal(result.code, 9);
  });
  it('supports event-only callers without an unhandled promise rejection', async () => {
    const code = await new Promise<number | null>((resolve) => {
      run(process.execPath, ['-e', 'process.exit(29)']).once('close', resolve);
    });
    assert.equal(code, 29);
  });
});
