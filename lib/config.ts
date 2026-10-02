import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { type Document, visit } from 'yaml';

import type {
  ConfigFormat,
  ConfigOrigin,
  ConfigPath,
  ConfigReadonly,
  ConfigSchema,
  ConfigSnapshot,
  ConfigSource,
  SourceInfo,
} from '../components/config.ts';
import clone from '../utils/clone-config.ts';
import mergeConfig, { type Provenance } from '../utils/merge-config.ts';
import normalize from '../utils/normalize-config.ts';
import validate from '../utils/validate-config.ts';
import yaml, { ImportObject, loadFile } from './yaml.ts';

// Explicit user-supplied modules are data inputs, never dependencies hidden from the bundler.
const loadModule = createRequire(import.meta.url);
interface Store {
  source: ConfigSource;
  revision: number;
  data?: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  document?: Document;
  dependencies: string[];
}
const segments = (key: ConfigPath) => (typeof key === 'string' ? key.split('.') : [...key]);
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const cloneDocument = (document?: Document) => {
  const copy = document?.clone();
  if (copy)
    visit(copy, {
      Scalar(_key, node) {
        node.value = clone(node.value);
      },
    });
  return copy;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (value instanceof ImportObject ||
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/** Inert source collection. Compile explicitly before reads and after source changes. */
export default class Config<T extends object = Record<string, unknown>> {
  #stores: Store[] = [];
  #schema: ConfigSchema;
  #revision = 0;
  #snapshot?: ConfigSnapshot<T>;
  #provenance: Provenance = new Map();
  readonly root: string;

  constructor({
    sources = [],
    schema = {},
    root = '.',
  }: { sources?: readonly ConfigSource[]; schema?: ConfigSchema; root?: string } = {}) {
    this.root = path.resolve(root);
    // Schema functions are deliberately retained; all mutable schema containers are copied.
    this.#schema = clone(schema);
    for (const source of sources) this.addSource(source);
  }

  /** Raw objects remain a permanent convenience; Config inputs retain loaded source context. */
  static from<T extends object = Record<string, unknown>>(
    input: Config<T> | object,
    options: { schema?: ConfigSchema; root?: string } = {},
  ): Config<T> {
    if (input instanceof Config) {
      const copy = input.fork();
      if (options.root && path.resolve(options.root) !== copy.root)
        throw new Error('A Config input retains its explicit root');
      if (options.schema) {
        copy.#schema = clone(options.schema);
        copy.#stores.forEach((store) => {
          store.normalized = undefined;
        });
        copy.#invalidate();
      }
      return copy;
    }
    return new Config<T>({ ...options, sources: [{ id: 'memory', kind: 'object', data: input }] });
  }

  get revision() {
    return this.#revision;
  }
  get sources(): readonly SourceInfo[] {
    return freeze(
      this.#stores.map(({ source, revision, dependencies }) => ({
        id: source.id,
        kind: source.kind,
        role: source.role,
        revision,
        base: source.base,
        file: source.kind === 'file' ? source.file : undefined,
        writable:
          source.kind === 'file' &&
          Boolean(source.writable) &&
          this.#format(source) !== 'javascript',
        dependencies: [...dependencies],
      })),
    );
  }
  #format(source: Extract<ConfigSource, { kind: 'file' }>): ConfigFormat {
    if (source.format) return source.format;
    const extension = path.extname(source.file).toLowerCase();
    if (['.js', '.mjs', '.cjs'].includes(extension)) return 'javascript';
    if (extension === '.json') return 'json';
    if (extension === '.yml' || extension === '.yaml') return 'yaml';
    throw new Error(`${source.id}: specify the format for ${source.file}`);
  }
  #capture(source: ConfigSource): ConfigSource {
    if (!source.id) throw new Error('Configuration sources require a nonempty ID');
    const copy = clone(source);
    if (source.kind === 'object' && copy.kind === 'object')
      copy.data = normalize(source.data) as Record<string, unknown>;
    copy.base = path.resolve(this.root, copy.base ?? '.');
    if (copy.kind === 'file') copy.file = path.resolve(copy.base, copy.file);
    return copy;
  }
  #invalidate() {
    this.#revision++;
    this.#snapshot = undefined;
  }

  addSource(source: ConfigSource, { before }: { before?: string } = {}): this {
    if (this.#stores.some((store) => store.source.id === source.id))
      throw new Error(`Duplicate configuration source: ${source.id}`);
    const index = before === undefined ? this.#stores.length : this.#index(before);
    this.#stores.splice(index, 0, { source: this.#capture(source), revision: 0, dependencies: [] });
    this.#invalidate();
    return this;
  }
  #index(id: string) {
    const index = this.#stores.findIndex((store) => store.source.id === id);
    if (index < 0) throw new Error(`Unknown configuration source: ${id}`);
    return index;
  }
  replaceSource(id: string, source: ConfigSource): this {
    if (source.id !== id) throw new Error('Replacing a source must preserve its ID');
    const index = this.#index(id);
    this.#stores[index] = {
      source: this.#capture(source),
      revision: this.#stores[index]!.revision + 1,
      dependencies: [],
    };
    this.#invalidate();
    return this;
  }
  removeSource(id: string): this {
    this.#stores.splice(this.#index(id), 1);
    this.#invalidate();
    return this;
  }
  /** Re-read this file and its imports on the next compile. JS reload refreshes the entry module only. */
  reloadSource(id: string): this {
    const store = this.#stores[this.#index(id)]!;
    if (store.source.kind !== 'file')
      throw new Error(`${id}: replace object/environment sources explicitly`);
    store.data = undefined;
    store.normalized = undefined;
    store.document = undefined;
    store.dependencies = [];
    store.revision++;
    this.#invalidate();
    return this;
  }
  fork(): Config<T> {
    const result = new Config<T>({ root: this.root, schema: this.#schema });
    result.#stores = this.#stores.map((store) => ({
      ...store,
      source: clone(store.source),
      data: store.data === undefined ? undefined : clone(store.data),
      normalized: store.normalized === undefined ? undefined : clone(store.normalized),
      document: cloneDocument(store.document),
      dependencies: [...store.dependencies],
    }));
    result.#revision = this.#revision;
    return result;
  }

  #load(store: Store): Record<string, unknown> {
    if (store.data !== undefined) return store.data;
    const { source } = store;
    let value: unknown;
    if (source.kind === 'object') value = source.data;
    else if (source.kind === 'environment') {
      const result: Record<string, unknown> = {};
      for (const [suffix, field] of Object.entries(source.fields)) {
        const raw = source.values[`${source.prefix}_${suffix}`];
        if (raw === undefined) continue;
        const keys = segments(field.path);
        let node = result;
        for (const key of keys.slice(0, -1)) {
          if (!Object.hasOwn(node, key))
            Object.defineProperty(node, key, {
              value: {},
              enumerable: true,
              writable: true,
              configurable: true,
            });
          if (!record(node[key])) throw new Error(`${source.id}: overlapping environment paths`);
          node = node[key];
        }
        const key = keys.at(-1);
        if (!key) throw new Error(`${source.id}: empty environment path`);
        Object.defineProperty(node, key, {
          value: field.parse ? field.parse(raw) : raw,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      value = result;
    } else {
      try {
        const format = this.#format(source);
        // Check only the explicitly supplied file; module-internal ENOENT is never optional.
        fs.statSync(source.file);
        if (format === 'yaml') {
          const loaded = loadFile(source.file, { imports: source.imports });
          store.document = loaded.document;
          store.dependencies = [...loaded.dependencies];
          value = loaded.value;
        } else if (format === 'json') {
          value = JSON.parse(fs.readFileSync(source.file, 'utf8'));
          store.dependencies = [source.file];
        } else {
          delete loadModule.cache[loadModule.resolve(source.file)];
          const loaded = loadModule(source.file) as unknown;
          value =
            loaded !== null && typeof loaded === 'object' && Object.hasOwn(loaded, 'default')
              ? (loaded as { default: unknown }).default
              : loaded;
          store.dependencies = [source.file];
        }
      } catch (error) {
        if (
          source.optional &&
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          (error as NodeJS.ErrnoException).path === source.file
        )
          value = {};
        else throw error;
      }
    }
    if (!record(value)) throw new Error('Configuration source must contain an object');
    store.data = normalize(value) as Record<string, unknown>;
    return store.data;
  }

  /** Loads/normalizes/validates once per revision. No persisted cache or host writes. */
  compile(): ConfigSnapshot<T> {
    if (this.#snapshot) return this.#snapshot;
    let values: Record<string, unknown> = {};
    const provenance: Provenance = new Map();
    for (const store of this.#stores) {
      try {
        const source = (store.normalized ??= normalize(this.#load(store), this.#schema, {
          app: store.source.role === 'app',
          base: store.source.kind === 'file' ? path.dirname(store.source.file) : store.source.base,
        }) as Record<string, unknown>);
        values = mergeConfig(
          values,
          source,
          {
            source: store.source.id,
            revision: store.revision,
            file: store.source.kind === 'file' ? store.source.file : undefined,
          },
          provenance,
        );
      } catch (error) {
        throw new Error(
          `${store.source.id}${store.source.kind === 'file' ? ` (${store.source.file})` : ''}: ${String(error instanceof Error ? error.message : error)}`,
          { cause: error },
        );
      }
    }
    try {
      validate(values, this.#schema);
    } catch (error) {
      throw new Error(
        `${String(error instanceof Error ? error.message : error)} [sources: ${this.#stores.map((store) => store.source.id).join(', ')}]`,
        { cause: error },
      );
    }
    this.#provenance = provenance;
    this.#snapshot = freeze({
      revision: this.#revision,
      values: values as ConfigReadonly<T>,
      sources: this.sources,
    });
    return this.#snapshot;
  }
  snapshot(): ConfigSnapshot<T> {
    if (!this.#snapshot)
      throw new Error('Config changed or has not been compiled; call compile() before reading');
    return this.#snapshot;
  }
  get(): ConfigReadonly<T>;
  get<K extends keyof T>(key: K): ConfigReadonly<T[K]>;
  get(key: ConfigPath): unknown;
  get(key?: ConfigPath): unknown {
    let value: unknown = this.snapshot().values;
    if (key === undefined) return value;
    for (const part of segments(key)) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }
  explain(key: ConfigPath): { contributors: readonly ConfigOrigin[]; winner?: ConfigOrigin } {
    this.snapshot();
    const contributors = clone(this.#provenance.get(JSON.stringify(segments(key))) ?? []);
    return freeze({ contributors, winner: contributors.at(-1) });
  }
  /** Serialize effective data; this is not a source edit and carries no source comments. */
  export(format: 'yaml' | 'json'): string {
    const values = normalize(this.get(), this.#schema, { external: true });
    return format === 'json' ? JSON.stringify(values, null, 2) + '\n' : yaml.dump(values);
  }
  /** A detached document for source inspection/future targeted persistence, never the merged result. */
  sourceDocument(id: string): Document | undefined {
    this.snapshot();
    return cloneDocument(this.#stores[this.#index(id)]!.document);
  }
}
