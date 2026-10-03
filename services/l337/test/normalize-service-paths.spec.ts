import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import normalize from '../utils/normalize-service-paths.ts';
import { ImportString } from '../../../lib/yaml.ts';

describe('service source-relative host paths', () => {
  it('normalizes only host inputs and retains destinations, steps, imports and volume names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-paths-'));
    try {
      fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM alpine');
      const text = new ImportString('FROM alpine', { file: path.join(root, 'Imported') });
      const input = {
        image: {
          imagefile: 'Dockerfile',
          context: ['assets:/assets', 'content', { src: 'third', destination: '/third' }],
          steps: [{ instructions: 'RUN echo /container' }],
        },
        build: { context: 'build', dockerfile: 'nested/Dockerfile' },
        volumes: [
          './src:/app:ro',
          'named:/store',
          '/anonymous',
          { source: 'files', target: '/files', type: 'bind' },
        ],
        command: '/container/run',
        working_dir: '/app',
      };
      const result = normalize(
        input,
        (keys) => (keys[0] === 'build' ? path.join(root, 'overlay') : root),
        ['named'],
      );
      assert.equal(
        (result.image as { imagefile: string }).imagefile,
        path.join(root, 'Dockerfile'),
      );
      assert.deepEqual(result.build, {
        context: path.join(root, 'overlay/build'),
        dockerfile: 'nested/Dockerfile',
      });
      assert.deepEqual(result.volumes, [
        `${root}/src:/app:ro`,
        'named:/store',
        '/anonymous',
        { source: `${root}/files`, target: '/files', type: 'bind' },
      ]);
      assert.deepEqual((result.image as { context: unknown }).context, [
        { source: `${root}/assets`, target: '/assets' },
        { source: `${root}/content`, target: 'content' },
        { src: `${root}/third`, destination: '/third', target: '/third' },
      ]);
      assert.equal(result.command, '/container/run');
      assert.equal(result.working_dir, '/app');
      assert.deepEqual((result.image as { steps: unknown }).steps, input.image.steps);
      assert.equal(input.build.context, 'build');
      assert.equal(normalize({ image: 'alpine:3.20' }, () => root).image, 'alpine:3.20');
      const imported = normalize({ image: text }, () => root).image as ImportString;
      assert.equal(imported.getMetadata().file, text.getMetadata().file);
      assert.equal(String(imported), 'FROM alpine');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
