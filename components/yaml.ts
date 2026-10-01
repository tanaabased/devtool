import exists from '../utils/exists-sync.ts';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import validPath from 'valid-path';
import traverseUp from '../utils/traverse-up.ts';

// @TODO: add in fileloader mapping?
// @TODO: integrate and rebase using read?
// @TODO: debugger?

// helper to extract type tag
const parseFileTypeInput = (input: string) => {
  // find the parts
  const parts = input.split('@');
  const file = parts[0].trim();
  const type = parts?.[1] ?? path.extname(file);

  return {
    file,
    type: type.startsWith('.') ? type.slice(1) : type,
  };
};

// helper to find file
const findFile = (file: string, base = process.cwd()) => {
  return traverseUp([file], path.resolve(base))
    .map((candidate) => path.join(path.dirname(candidate), file))
    .find((candidate) => fs.existsSync(candidate));
};

// file loader options
export interface ImportMetadata {
  raw?: string;
  file?: string;
  type?: string;
}
const fileloader: yaml.TypeConstructorOptions = {
  kind: 'scalar',
  resolve: function (this: FileType, data: string) {
    // Kill immediately if we have to
    if (typeof data !== 'string') return false;

    // try to sus out type/path info from data
    const input = parseFileTypeInput(data);

    // if data is not an absolute path then resolve with base
    if (!path.isAbsolute(input.file)) input.file = findFile(input.file, this.base) ?? '';

    // Otherwise check the path exists
    return exists(input.file);
  },
  construct: function (this: FileType, data: string) {
    // transform data
    const input = { raw: data, ...parseFileTypeInput(data) };
    // normalize if needed
    input.file = !path.isAbsolute(input.file)
      ? (findFile(input.file, this.base) ?? '')
      : input.file;

    // switch based on type
    switch (input.type) {
      case 'binary':
        return new ImportString(fs.readFileSync(input.file, { encoding: 'base64' }), input);
      case 'json':
        return new ImportObject(
          JSON.parse(fs.readFileSync(input.file, { encoding: 'utf8' })) as Record<string, unknown>,
          input,
        );
      case 'string':
        return new ImportString(fs.readFileSync(input.file, { encoding: 'utf8' }), input);
      case 'yaml':
      case 'yml':
        return new ImportObject(load(input.file), input);
      default:
        return new ImportString(fs.readFileSync(input.file, { encoding: 'utf8' }), input);
    }
  },
  predicate: (data) => data instanceof ImportString || data instanceof ImportObject,
  represent: (data: object) =>
    data instanceof ImportString || data instanceof ImportObject ? (data.getDumper() ?? '') : '',
};

// wrapper to accomodate a base url for files
class FileType extends yaml.Type {
  base: string;
  constructor(tag: string, options: yaml.TypeConstructorOptions & { base?: string }) {
    // extract the base from options to pass super validation
    const base = options.base ?? process.cwd();
    delete options.base;

    // super
    super(tag, options);

    // readd base
    this.base = base;
  }
}

const getLandoSchema = (base = process.cwd()) => {
  return yaml.DEFAULT_SCHEMA.extend([
    new FileType('!import', { ...fileloader, base }),
    new FileType('!load', { ...fileloader, base }),
  ]);
};

export class ImportString extends String {
  #metadata: ImportMetadata;

  constructor(value: string, metadata: ImportMetadata = {}) {
    super(value);
    this.#metadata = metadata;
  }

  getMetadata() {
    return this.#metadata;
  }

  getDumper() {
    return this.#metadata.raw;
  }

  [Symbol.toPrimitive](hint: string) {
    if (hint === 'string') {
      return this.toString();
    }
    return this.toString();
  }
}

export class ImportObject extends Object {
  #metadata: ImportMetadata;

  constructor(value: unknown = {}, metadata: ImportMetadata = {}) {
    super();
    Object.assign(this, value);
    this.#metadata = metadata;
  }

  getMetadata() {
    return this.#metadata;
  }

  getDumper() {
    return this.#metadata.raw;
  }
}

// old ones
const rawLoad = yaml.load;
const rawDump = yaml.dump;

const load = (
  data: string | Buffer,
  options: yaml.LoadOptions & { base?: string } = {},
): unknown => {
  // if data is buffer then just pass it through
  if (Buffer.isBuffer(data))
    return rawLoad(String(data), { schema: getLandoSchema(options.base), ...options });
  // ditto for multiline strings
  else if (data.split('\n').length > 1)
    return rawLoad(String(data), { schema: getLandoSchema(options.base), ...options });

  // if we get here its either the path to a file or not
  // if data is actually a file then we do some extra stuff
  if (validPath(data) && fs.existsSync(data)) {
    options.base = options.base ?? path.dirname(path.resolve(data));
    data = fs.readFileSync(data, { encoding: 'utf8' });
  }

  // pass through
  return rawLoad(String(data), { schema: getLandoSchema(options.base), ...options });
};

const dump = (data: unknown, options: yaml.DumpOptions = {}) => {
  return rawDump(data, { schema: getLandoSchema(), quotingType: '"', ...options });
};

export default { ...yaml, load, dump };
