import type { DumpOptions } from 'js-yaml';
import asError from './as-error.ts';
import fs from 'node:fs';
import get from 'lodash-es/get.js';
import path from 'node:path';
import remove from './remove.ts';
import yaml from '../lib/yaml.ts';
import jsonfile from 'jsonfile';

/** Write data using the selected extension's serializer; optionally normalize line endings. */
export default (
  file: string,
  data: unknown,
  options: DumpOptions & { extension?: string; forcePosixLineEndings?: boolean } = {},
) => {
  // set extension if not set
  const extension = options.extension || path.extname(file);
  // Recover directories created by Compose for missing bind sources; preserve existing file inodes.
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) remove(file);
  // linux line endings
  const forcePosixLineEndings = options.forcePosixLineEndings ?? false;

  // special handling for ImportString
  if (typeof data !== 'string' && data?.constructor?.name === 'ImportString') data = String(data);

  // data is a string and posixOnly then replace
  if (typeof data === 'string' && forcePosixLineEndings) data = data.replace(/\r\n/g, '\n');

  switch (extension) {
    case '.yaml':
    case '.yml':
    case 'yaml':
    case 'yml':
      // if this is a YAML DOC then use yaml module
      if (get(data, 'constructor.name') === 'Document') {
        try {
          fs.writeFileSync(file, String(data));
        } catch (caught) {
          const error = asError(caught);
          throw error;
        }

        // otherwise use the normal js-yaml dump
      } else {
        try {
          fs.writeFileSync(file, yaml.dump(data, options));
        } catch (caught) {
          const error = asError(caught);
          throw error;
        }
      }
      break;
    case '.json':
    case 'json':
      jsonfile.writeFileSync(file, data, { spaces: 2, ...options });
      break;
    default:
      if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
      if (typeof data !== 'string' && !ArrayBuffer.isView(data))
        throw new TypeError('File contents must be a string or buffer');
      fs.writeFileSync(file, data as string | NodeJS.ArrayBufferView, { encoding: 'utf-8' });
  }
};
