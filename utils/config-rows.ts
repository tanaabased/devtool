import type { ConfigOrigin, ConfigSchema } from '../components/config.ts';
import type Config from '../lib/config.ts';
import configKey from './config-key.ts';
import normalize from './normalize-config.ts';

export interface ConfigRow {
  key: string;
  value: unknown;
  contributors: readonly ConfigOrigin[];
  winner?: ConfigOrigin;
}

/** Flatten objects only. Arrays and empty objects remain visible, typed values. */
export default function configRows(
  config: Config<object>,
  value: unknown,
  schema: ConfigSchema,
  prefix: readonly string[] = [],
): ConfigRow[] {
  const rows: ConfigRow[] = [];
  const visit = (data: unknown, keys: readonly string[]) => {
    if (
      data !== null &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.keys(data).length
    ) {
      for (const [key, child] of Object.entries(data)) visit(child, [...keys, key]);
    } else {
      const key = keys.length ? configKey(keys, schema).external.join('.') : '(root)';
      rows.push({
        key,
        value: normalize(data, keys.length ? configKey(keys, schema).schema : schema, {
          external: true,
        }),
        ...config.explain(keys),
      });
    }
  };
  visit(value, prefix);
  return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
