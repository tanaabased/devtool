import jsonfile, { type JFReadOptions } from 'jsonfile';
import { createRequire } from 'node:module';
import type { LoadOptions } from 'js-yaml';
const loadDataModule = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
import yaml from '../lib/yaml.ts';

export default (
  file: string,
  options: LoadOptions &
    Exclude<JFReadOptions, string | null | undefined> & { base?: string; extension?: string } = {},
): unknown => {
  // @TODO: file does nto exist?

  // set extension if not set
  const extension = options.extension || path.extname(file);

  // @TODO: better try/catches here?
  // @TODO: throw error for default?
  switch (extension) {
    case '.yaml':
    case '.yml':
    case 'yaml':
    case 'yml':
      return yaml.load(fs.readFileSync(file, 'utf8'), {
        base: path.dirname(path.resolve(file)),
        ...options,
      });
    case '.cjs':
    case '.js':
    case 'js':
      // Explicit legacy data-module boundary; runtime modules use ESM imports.
      return loadDataModule(path.resolve(file));
    case '.json':
    case 'json':
      return jsonfile.readFileSync(file, options) as unknown;
    default:
      return fs.readFileSync(file, 'utf8');
  }
};
