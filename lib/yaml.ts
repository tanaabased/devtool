import fs from 'node:fs';
import path from 'node:path';

import { parseDocument, stringify, type Document, type ScalarTag } from 'yaml';

import findFile from '../utils/find-file.ts';
import parseFileTypeInput from '../utils/parse-file-type.ts';

export interface ImportMetadata {
  raw?: string;
  file?: string;
  type?: string;
}
export class ImportString extends String {
  #metadata: ImportMetadata;
  constructor(value: string, metadata: ImportMetadata = {}) {
    super(value);
    this.#metadata = { ...metadata };
  }
  getMetadata() {
    return { ...this.#metadata };
  }
  getDumper() {
    return this.#metadata.raw;
  }
}
export class ImportObject {
  #metadata: ImportMetadata;
  constructor(value: unknown = {}, metadata: ImportMetadata = {}) {
    for (const [key, item] of Object.entries(value as object))
      Object.defineProperty(this, key, {
        value: item,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    this.#metadata = { ...metadata };
  }
  getMetadata() {
    return { ...this.#metadata };
  }
  getDumper() {
    return this.#metadata.raw;
  }
}
export class ImportArray extends Array<unknown> {
  #metadata: ImportMetadata;
  static override get [Symbol.species]() {
    return Array;
  }
  constructor(values: readonly unknown[], metadata: ImportMetadata = {}) {
    super();
    this.push(...values);
    this.#metadata = { ...metadata };
  }
  getMetadata() {
    return { ...this.#metadata };
  }
  getDumper() {
    return this.#metadata.raw;
  }
}
const imported = (value: unknown, metadata: ImportMetadata) =>
  Array.isArray(value)
    ? new ImportArray(value, metadata)
    : value !== null && typeof value === 'object'
      ? new ImportObject(value, metadata)
      : new ImportString(String(value ?? ''), metadata);

export interface YamlOptions {
  base?: string;
  filename?: string;
  imports?: boolean;
  /** Internal traversal context shared by nested imports. */
  stack?: readonly string[];
  dependencies?: Set<string>;
}

/** Parse a source document without flattening its comments, anchors or import nodes. */
export function readDocument(
  text: string,
  options: YamlOptions = {},
): { document: Document; value: unknown } {
  const base = options.base ?? process.cwd();
  const resolve = (raw: string) => {
    const input = parseFileTypeInput(raw);
    const file = path.isAbsolute(input.file) ? input.file : findFile(input.file, base);
    if (!file) throw new Error(`cannot resolve import ${raw} from ${base}`);
    const canonical = fs.realpathSync(file);
    const stack = options.stack ?? [];
    if (stack.includes(canonical))
      throw new Error(`Import cycle: ${[...stack, canonical].join(' -> ')}`);
    options.dependencies?.add(canonical);
    const metadata = { ...input, raw, file: path.resolve(file) };
    const source = fs.readFileSync(canonical);
    if (input.type === 'json') return imported(JSON.parse(String(source)), metadata);
    if (input.type === 'yaml' || input.type === 'yml') {
      const nested = readDocument(String(source), {
        ...options,
        base: path.dirname(canonical),
        filename: canonical,
        stack: [...stack, canonical],
      });
      return imported(nested.value, metadata);
    }
    return new ImportString(source.toString(input.type === 'binary' ? 'base64' : 'utf8'), metadata);
  };
  const tags: ScalarTag[] =
    options.imports === false
      ? []
      : ['!import', '!load'].map((tag) => ({
          tag,
          resolve,
          stringify: (item) =>
            stringify(
              (item.value as ImportString | ImportObject | ImportArray).getDumper() ?? '',
            ).trimEnd(),
        }));
  const document = parseDocument(text, { customTags: tags, keepSourceTokens: true, merge: true });
  const failure = document.errors[0] ?? document.warnings[0];
  if (failure) throw new Error(`${options.filename ?? base}: ${failure.message}`);
  return { document, value: document.toJS({ maxAliasCount: 100 }) as unknown };
}

/** Explicit path loader: unlike load(), a missing file is never interpreted as YAML text. */
export function loadFile(file: string, options: YamlOptions = {}) {
  const canonical = fs.realpathSync(file);
  const dependencies = options.dependencies ?? new Set<string>();
  dependencies.add(canonical);
  return {
    ...readDocument(fs.readFileSync(canonical, 'utf8'), {
      ...options,
      dependencies,
      base: path.dirname(canonical),
      filename: canonical,
      stack: [canonical],
    }),
    dependencies,
  };
}

const load = (data: string | Buffer, options: YamlOptions = {}): unknown => {
  if (typeof data === 'string' && !data.includes('\n') && fs.existsSync(data))
    return loadFile(data, options).value;
  return readDocument(String(data), options).value;
};
const dump = (
  data: unknown,
  options: { lineWidth?: number; indent?: number; noRefs?: boolean } = {},
): string =>
  stringify(data, {
    ...(options.lineWidth === undefined ? {} : { lineWidth: options.lineWidth }),
    ...(options.indent === undefined ? {} : { indent: options.indent }),
    aliasDuplicateObjects: !options.noRefs,
    customTags: [
      {
        tag: '!import',
        resolve: (value: string) => value,
        identify: (value) =>
          value instanceof ImportString ||
          value instanceof ImportObject ||
          value instanceof ImportArray,
        stringify: (item) =>
          JSON.stringify(
            (item.value as ImportString | ImportObject | ImportArray).getDumper() ?? '',
          ),
      },
    ],
  });
export default { load, dump };
