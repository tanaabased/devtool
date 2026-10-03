import fs from 'node:fs';
import path from 'node:path';

import type { FileSource } from '../components/config.ts';
import type { AppLayer } from '../lib/types.ts';

export interface AppDiscoveryOptions {
  cwd?: string;
  file?: string;
  filenames?: readonly string[];
  preFiles?: readonly AppLayer[];
  postFiles?: readonly AppLayer[];
}

/** CLI discovery policy only: explicit file or nearest ancestor, then canonical source/root. */
export default function discoverApp({
  cwd = process.cwd(),
  file,
  filenames = ['.devtool.yml', '.devtool.yaml'],
  preFiles = [],
  postFiles = [],
}: AppDiscoveryOptions = {}) {
  if (!filenames.length || filenames.some((name) => !name || path.basename(name) !== name))
    throw new Error('App discovery requires nonempty filenames');
  let directory = path.resolve(cwd);
  let selected = file === undefined ? undefined : path.resolve(directory, file);
  while (!selected) {
    selected = filenames
      .map((name) => path.join(directory, name))
      .find((candidate) => fs.existsSync(candidate));
    const parent = path.dirname(directory);
    if (selected || parent === directory) break;
    directory = parent;
  }
  if (!selected) throw new Error(`No app file found (${filenames.join(', ')}) from ${cwd}`);
  selected = fs.realpathSync(selected);
  if (!fs.statSync(selected).isFile()) throw new Error(`App source is not a file: ${selected}`);
  const root = path.dirname(selected);
  const seen = new Set<string>();
  const layers = (entries: readonly AppLayer[], prefix: string): FileSource[] =>
    entries.map(({ file, optional = false }, index) => {
      if (!file) throw new Error('Layer file must not be empty');
      return { id: `${prefix}-${index}`, kind: 'file', file: path.resolve(root, file), optional };
    });
  const sources: FileSource[] = [
    ...layers(preFiles, 'pre'),
    { id: 'primary', kind: 'file', file: selected, writable: true },
    ...layers(postFiles, 'post'),
  ];
  for (const source of sources) {
    try {
      const canonical = fs.realpathSync(source.file);
      if (!fs.statSync(canonical).isFile()) throw new Error('not a file');
      source.file = canonical;
    } catch (error) {
      if (!source.optional || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(`${source.id} (${source.file}): ${String(error)}`, { cause: error });
    }
    if (seen.has(source.file)) throw new Error(`Duplicate app layer: ${source.file}`);
    seen.add(source.file);
  }
  return { file: selected, root, sources, writeTarget: 'primary' };
}
