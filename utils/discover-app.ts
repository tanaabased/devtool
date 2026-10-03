import fs from 'node:fs';
import path from 'node:path';

import type { FileSource } from '../components/config.ts';

/** Only absence of a primary permits contextual commands to use global settings. */
export class AppNotFoundError extends Error {}

export interface AppLayer {
  /** Filename stem, relative to the discovered root. YAML is preferred over YML. */
  file: string;
  optional?: boolean;
}

export interface AppDiscoveryPolicy {
  /** Primary basename without a YAML extension; only this file identifies an app root. */
  appFile?: string;
  /** Ordered stems or descriptors. Include the primary exactly once, by name or '.'. */
  appFiles?: readonly (string | AppLayer)[];
}

export interface AppDiscoveryOptions extends AppDiscoveryPolicy {
  cwd?: string;
}

/** Discover the nearest primary, then resolve ordered layers at its canonical root. */
export default function discoverApp({
  cwd = process.cwd(),
  appFile = '.devtool',
  appFiles = [appFile],
}: AppDiscoveryOptions = {}) {
  const stem = (file: string) =>
    typeof file === 'string' && file.length > 0 && !/\.ya?ml$/i.test(file);
  if (!stem(appFile) || ['.', '..'].includes(appFile) || path.basename(appFile) !== appFile)
    throw new Error('appFile must be a filename stem without a YAML extension');
  const entries = appFiles.map((entry) => {
    const layer = typeof entry === 'string' ? { file: entry } : { ...entry };
    if (layer.file === '.') layer.file = appFile;
    if (!stem(layer.file) || (layer.optional !== undefined && typeof layer.optional !== 'boolean'))
      throw new Error('appFiles requires filename stems and boolean optional flags');
    return layer;
  });
  const primary = entries.filter(({ file }) => file === appFile);
  if (primary.length !== 1 || primary[0]!.optional)
    throw new Error('appFiles must include the required primary exactly once');
  const resolve = (directory: string, file: string) => {
    for (const extension of ['yaml', 'yml']) {
      const candidate = path.resolve(directory, `${file}.${extension}`);
      try {
        fs.lstatSync(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const canonical = fs.realpathSync(candidate);
      if (!fs.statSync(canonical).isFile())
        throw new Error(`App source is not a file: ${candidate}`);
      return canonical;
    }
    return undefined;
  };
  let directory = path.resolve(cwd);
  let selected: string | undefined;
  while (!selected) {
    selected = resolve(directory, appFile);
    const parent = path.dirname(directory);
    if (selected || parent === directory) break;
    directory = parent;
  }
  if (!selected)
    throw new AppNotFoundError(`No app file found (${appFile}.yaml or .yml) from ${cwd}`);
  const root = path.dirname(selected);
  const seen = new Set<string>();
  const sources: FileSource[] = entries.map(({ file, optional }, index) => {
    const isPrimary = file === appFile;
    const resolved = isPrimary ? selected : resolve(root, file);
    if (!resolved && !optional) throw new Error(`Missing app layer: ${path.resolve(root, file)}`);
    const source: FileSource = {
      id: isPrimary ? 'primary' : `layer-${index}`,
      kind: 'file',
      file: resolved ?? path.resolve(root, `${file}.yaml`),
      ...(isPrimary ? { writable: true } : { optional: optional ?? false }),
    };
    if (seen.has(source.file)) throw new Error(`Duplicate app layer: ${source.file}`);
    seen.add(source.file);
    return source;
  });
  const policy = Object.freeze({
    appFile,
    appFiles: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
  return { file: selected, root, sources, writeTarget: 'primary', policy };
}
