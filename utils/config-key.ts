import camelCase from 'lodash-es/camelCase.js';
import kebabCase from 'lodash-es/kebabCase.js';

import type { ConfigSchema } from '../components/config.ts';

/** Resolve schema-owned path segments; arbitrary dictionary names remain literal. */
export default function configKey(path: string | readonly string[], schema: ConfigSchema) {
  const keys = typeof path === 'string' ? path.split('.') : [...path];
  if (!keys.length || keys.some((key) => !key))
    throw new Error('Configuration key must be nonempty');
  let node = schema;
  const internal: string[] = [];
  const external: string[] = [];
  for (const key of keys) {
    const field = Object.entries(node.properties ?? {}).find(
      ([name]) => key === camelCase(name) || key === kebabCase(name),
    );
    internal.push(field ? camelCase(field[0]) : key);
    external.push(field ? kebabCase(field[0]) : key);
    node = field?.[1] ?? node.items ?? node.values ?? {};
  }
  return { internal, external, schema: node };
}
