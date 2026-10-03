import path from 'node:path';
import type Config from '../lib/config.ts';
import type { ProductConfig, ProductSettings } from '../lib/types.ts';
import clone from './clone-config.ts';

/** Config caches compilation; the compatibility result is a detached, resolved value object. */
export default function resolveProductConfig(config: Config<ProductSettings>): ProductConfig {
  const values = clone(config.compile().values);
  for (const key of [
    'identity',
    'commandName',
    'envPrefix',
    'appFiles',
    'dataRoot',
    'cache',
  ] as const)
    if (values[key] === undefined) throw new Error(`Product configuration requires ${key}`);
  return {
    ...values,
    cacheRoot: values.cacheRoot ?? path.join(values.dataRoot!, 'cache'),
  } as ProductConfig;
}
