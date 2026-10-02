import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { shellAssets } from '../lib/shell-assets.ts';
import metadata from '../package.json';

const root = path.resolve(import.meta.dirname, '..');
const distribution = path.join(root, 'dist');
const library = path.join(distribution, 'npm');
const run = (args: string[], cwd = root) =>
  execFileSync(process.execPath, args, { cwd, stdio: 'inherit' });
const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
fs.rmSync(library, { recursive: true, force: true });
fs.rmSync(path.join(distribution, 'devtool.tgz'), { force: true });
run(['--bun', 'tsc', '-p', 'tsconfig.build.json']);

// The library keeps ordinary files. The standalone build still uses Bun's static file imports.
fs.writeFileSync(
  path.join(library, 'lib/shell-assets.js'),
  `import { fileURLToPath } from 'node:url';
export const shellAssets = Object.fromEntries(${JSON.stringify(Object.keys(shellAssets))}.map(id => [id, fileURLToPath(new URL('../' + id, import.meta.url))]));
export default id => shellAssets[id];
`,
);
for (const id of Object.keys(shellAssets)) {
  const destination = path.join(library, id);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, id), destination);
  fs.chmodSync(destination, 0o755);
}
// TypeScript rewrites runtime extensions but retains .ts in emitted declarations.
for (const file of new Bun.Glob('**/*.d.ts').scanSync(library)) {
  const location = path.join(library, file);
  fs.writeFileSync(
    location,
    fs.readFileSync(location, 'utf8').replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, '$1$2.js$1'),
  );
}
const { name, version, description, license, repository, dependencies } = metadata;
writeJson(path.join(library, 'package.json'), {
  name,
  version,
  description,
  license,
  repository,
  type: 'module',
  main: './lib/devtool.js',
  types: './lib/devtool.d.ts',
  exports: { '.': { types: './lib/devtool.d.ts', import: './lib/devtool.js' } },
  files: [
    'lib/',
    'components/',
    'builders/',
    'utils/',
    'packages/',
    'scripts/',
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.txt',
  ],
  dependencies: {
    ...dependencies,
    '@types/debug': metadata.devDependencies['@types/debug'],
    '@types/dockerode': metadata.devDependencies['@types/dockerode'],
    '@types/js-yaml': metadata.devDependencies['@types/js-yaml'],
    '@types/jsonfile': metadata.devDependencies['@types/jsonfile'],
  },
});
for (const file of ['LICENSE', 'README.md'])
  fs.copyFileSync(path.join(root, file), path.join(library, file));
run(['run', 'build:cli', '--metafile=dist/cli-meta.json']);
const inputs = Object.keys(
  (await Bun.file(path.join(distribution, 'cli-meta.json')).json()).inputs,
);
const bundledPackages = new Set<string>();
for (const input of inputs.filter((input) => input.startsWith('node_modules/'))) {
  let directory = path.dirname(path.join(root, input));
  while (directory !== root) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name) {
      bundledPackages.add(directory);
      break;
    }
    directory = path.dirname(directory);
  }
}
const notices = [
  `The compiled executable embeds Bun ${Bun.version}. Runtime and linked-library notices: https://bun.com/docs/project/license\nSource: https://github.com/oven-sh/bun/tree/bun-v${Bun.version}\n`,
];
for (const directory of [...bundledPackages].sort()) {
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const files = fs.readdirSync(directory);
  let licenses = files.filter((file) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(file));
  // Some upstream packages publish their notice only in the README or package metadata.
  if (!licenses.length) licenses = files.filter((file) => /^readme(\.|$)/i.test(file));
  notices.push(
    `${info.name}@${info.version}\n${JSON.stringify({ license: info.license, author: info.author, repository: info.repository })}\n`,
  );
  for (const file of licenses.sort())
    notices.push(fs.readFileSync(path.join(directory, file), 'utf8'));
}
fs.writeFileSync(path.join(library, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n---\n\n'));
fs.copyFileSync(
  path.join(library, 'THIRD_PARTY_NOTICES.txt'),
  path.join(distribution, 'THIRD_PARTY_NOTICES.txt'),
);
run(
  [
    'pm',
    'pack',
    '--ignore-scripts',
    '--quiet',
    '--filename',
    path.join(distribution, 'devtool.tgz'),
  ],
  library,
);
