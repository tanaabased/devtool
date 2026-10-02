import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { metafile: { type: 'string' } } });
const metafile = values.metafile ? path.resolve(root, values.metafile) : undefined;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-compile-'));
try {
  // Bun can orphan a read-only clone of its Homebrew executable in the compiler's cwd.
  execFileSync(
    process.execPath,
    [
      'build',
      path.join(root, 'bin/devtool.ts'),
      '--root',
      root,
      '--compile',
      '--bytecode',
      '--format=esm',
      '--minify',
      '--sourcemap',
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      '--no-compile-autoload-tsconfig',
      '--no-compile-autoload-package-json',
      '--outfile',
      path.join(root, 'dist/devtool'),
      ...(metafile ? [`--metafile=${metafile}`] : []),
    ],
    { cwd: temporary, stdio: 'inherit' },
  );
  if (metafile) {
    const metadata: Bun.BuildMetafile = JSON.parse(fs.readFileSync(metafile, 'utf8'));
    // Keep source paths relative to the repo for license collection and bundle inspection.
    const sourcePath = (file: string) => path.relative(root, path.resolve(temporary, file));
    const rebaseInputs = <T>(inputs: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(inputs).map(([file, input]) => [sourcePath(file), input]));
    for (const input of Object.values(metadata.inputs)) {
      for (const dependency of input.imports) {
        if (Object.hasOwn(metadata.inputs, dependency.path))
          dependency.path = sourcePath(dependency.path);
      }
    }
    metadata.inputs = rebaseInputs(metadata.inputs);
    for (const output of Object.values(metadata.outputs)) {
      output.inputs = rebaseInputs(output.inputs);
      if (output.entryPoint) output.entryPoint = sourcePath(output.entryPoint);
    }
    fs.writeFileSync(metafile, JSON.stringify(metadata, null, 2) + '\n');
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
