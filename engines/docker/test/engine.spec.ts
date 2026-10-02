import asError from '../../../utils/as-error.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import DockerEngine from '../lib/builder.ts';

describe('process and build boundaries', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-process-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  it('runs buildx and stages local sources using an injected executable', async () => {
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
