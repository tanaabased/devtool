import camelCase from 'lodash-es/camelCase.js';

import type { ConfigSchema } from '../components/config.ts';
import { ImportString } from '../lib/yaml.ts';

/** Validate the effective configuration, after all partial sources have merged. */
export default function validateConfig(
  value: unknown,
  schema: ConfigSchema,
  location = 'config',
): void {
  if (value === null && schema.nullable) return;
  const type = Array.isArray(value)
    ? 'array'
    : value instanceof ImportString
      ? 'string'
      : typeof value;
  if (schema.type && (type !== schema.type || value === null))
    throw new Error(`${location}: expected ${schema.type}`);
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof ImportString)
  ) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(object, camelCase(key)))
        throw new Error(`${location}.${key}: required setting`);
    }
    const fields = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, node]) => [camelCase(key), node]),
    );
    for (const [key, item] of Object.entries(object)) {
      const node = Object.hasOwn(fields, key) ? fields[key] : schema.values;
      if (node) validateConfig(item, node, `${location}.${key}`);
    }
  }
  if (Array.isArray(value) && schema.items)
    value.forEach((item, index) => validateConfig(item, schema.items!, `${location}[${index}]`));
  schema.validate?.(value);
}
