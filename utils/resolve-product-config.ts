import path from 'node:path';
import type Config from '../lib/config.ts';
import type { ProductConfig, ProductSettings } from '../lib/types.ts';
import clone from './clone-config.ts';

/** Resolve required product settings and derive cache storage from the compiled configuration. */
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
