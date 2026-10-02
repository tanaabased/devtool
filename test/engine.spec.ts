import asError from '../utils/as-error.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import DockerEngine from '../components/docker-engine.ts';
import execute from '../utils/execute.ts';
import getBuildxError from '../utils/get-buildx-error.ts';
import copyBuildSource from '../utils/copy-build-source.ts';

describe('process and build boundaries', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-process-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
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
    await assert.rejects(execute(path.join(directory, 'missing'), []), /Unable to run/);
  });
  it('runs the retained buildx path and stages local sources using an injected executable', async () => {
    const builder = path.join(directory, 'builder');
    fs.writeFileSync(
      builder,
      `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`,
    );
    fs.chmodSync(builder, 0o755);
    const imagefile = path.join(directory, 'Imagefile');
    fs.writeFileSync(imagefile, 'FROM alpine\n');
    const input = path.join(directory, 'input');
    fs.writeFileSync(input, 'source');
    const context = path.join(directory, 'context');
    const engine = new DockerEngine({}, { builder });
    await engine.buildx(imagefile, {
      context,
      tag: 'owned-test',
      sources: [{ source: input, target: 'input' }],
      buildArgs: { VALUE: 'a b' },
    });
    assert.equal(fs.readFileSync(path.join(context, 'input'), 'utf8'), 'source');
    assert.equal(fs.readFileSync(path.join(context, 'Dockerfile'), 'utf8'), 'FROM alpine\n');
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
  it('preserves useful diagnostics when buildx reports a failure without step output', () => {
    const parse = getBuildxError;
    assert.match(
      parse({ stderr: '#1 ERROR: missing COPY source\n' }).message,
      /missing COPY source/,
    );
    assert.match(parse({ stderr: '\nfailed to solve: missing file' }).message, /missing file/);
  });
  it('rejects builder failures rather than resolving successful image state', async () => {
    const builder = path.join(directory, 'builder');
    fs.writeFileSync(
      builder,
      `#!${process.execPath}\nconsole.error('broken image build');process.exit(23);\n`,
    );
    fs.chmodSync(builder, 0o755);
    const imagefile = path.join(directory, 'Imagefile');
    fs.writeFileSync(imagefile, 'FROM alpine\n');
    await assert.rejects(
      new DockerEngine({}, { builder }).buildx(imagefile, {
        context: path.join(directory, 'context'),
        tag: 'test',
      }),
      (error) => asError(error).code === 23 && /broken image/.test(asError(error).message),
    );
  });
});

describe('build context containment', () => {
  it('excludes generated storage and rejects escaping destination paths', () => {
    const copy = copyBuildSource;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-copy-'));
    try {
      const source = path.join(root, 'app');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'input'), 'data');
      const generated = path.join(source, 'generated');
      fs.mkdirSync(generated);
      const context = path.join(generated, 'context');
      copy({ source, target: '.' }, context, [generated]);
      assert.equal(fs.readFileSync(path.join(context, 'input'), 'utf8'), 'data');
      assert.equal(fs.existsSync(path.join(context, 'generated')), false);
      assert.throws(() => copy({ source, target: '../outside' }, context, [generated]), /escapes/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
