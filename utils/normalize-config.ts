import path from 'node:path';

import camelCase from 'lodash-es/camelCase.js';
import kebabCase from 'lodash-es/kebabCase.js';

import type { ConfigSchema } from '../components/config.ts';
import { ImportArray, ImportObject, ImportScalar, ImportString } from '../lib/yaml.ts';

/** Convert declared keys only, rejecting aliases and cyclic/non-data objects. */
export default function normalizeConfig(
  input: unknown,
  schema: ConfigSchema = {},
  {
    external = false,
    app = false,
    base,
  }: { external?: boolean; app?: boolean; base?: string } = {},
): unknown {
  const ancestors = new Set<object>();
  const visit = (
    value: unknown,
    node: ConfigSchema,
    location: string,
    directory = base,
    appInput = app,
  ): unknown => {
    if (node.readOnly) throw new Error(`${location}: ${node.readOnly}`);
    appInput ||= Boolean(node.app);
    if (!value || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
        throw new Error(`${location}: expected configuration data`);
      return node.path && directory && typeof value === 'string' && !external
        ? path.resolve(directory, value)
        : value;
    }
    if (value instanceof ImportScalar)
      return external ? value.value : new ImportScalar(value.value, value.getMetadata());
    if (value instanceof ImportString) {
      if (external) return String(value);
      const metadata = value.getMetadata();
      const sourceBase = metadata.file ? path.dirname(metadata.file) : directory;
      return new ImportString(
        node.path && sourceBase ? path.resolve(sourceBase, String(value)) : String(value),
        metadata,
      );
    }
    if (ancestors.has(value)) throw new Error(`${location}: cyclic configuration data`);
    ancestors.add(value);
    try {
      const importedFrom =
        value instanceof ImportObject || value instanceof ImportArray
          ? value.getMetadata().file
          : undefined;
      const childBase = importedFrom ? path.dirname(importedFrom) : directory;
      if (Array.isArray(value)) {
        const items = value.map((item, index) =>
          visit(item, node.items ?? {}, `${location}[${index}]`, childBase, appInput),
        );
        return value instanceof ImportArray && !external
          ? new ImportArray(items, value.getMetadata())
          : items;
      }
      if (
        !(value instanceof ImportObject) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw new Error(`${location}: expected a plain configuration object`);
      const fields = new Map<string, ConfigSchema>();
      for (const [key, field] of Object.entries(node.properties ?? {})) {
        const canonical = camelCase(key);
        if (fields.has(canonical)) throw new Error(`${location}: ambiguous schema key ${key}`);
        fields.set(canonical, field);
      }
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue;
        const canonical = camelCase(key);
        const field = fields.get(canonical);
        const recognized = field && (key === canonical || key === kebabCase(canonical));
        const destination = recognized ? (external ? kebabCase(canonical) : canonical) : key;
        if (Object.hasOwn(result, destination))
          throw new Error(`${location}: ambiguous key ${key}`);
        if (appInput && recognized && field.protected)
          throw new Error(`${location}.${key}: protected setting cannot be supplied by an app`);
        Object.defineProperty(result, destination, {
          value: visit(
            item,
            recognized ? field : (node.values ?? {}),
            `${location}.${key}`,
            childBase,
            appInput,
          ),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return value instanceof ImportObject && !external
        ? new ImportObject(result, { ...value.getMetadata() })
        : result;
    } finally {
      ancestors.delete(value);
    }
  };
  return visit(input, schema, 'config');
}
