import type { EnvironmentSource } from '../components/config.ts';

/** Only declared settings enter configuration; control variables such as CONFIG_DIR stay out. */
export default function productEnvironmentSource(
  prefix: string,
  values: Readonly<NodeJS.ProcessEnv>,
): EnvironmentSource {
  return {
    id: 'environment',
    kind: 'environment',
    role: 'environment',
    prefix,
    values: { ...values },
    fields: {
      COMMAND_NAME: { path: 'commandName' },
      DATA_ROOT: { path: 'dataRoot' },
      CACHE_ROOT: { path: 'cacheRoot' },
      APP_FILES: { path: 'appFiles', parse: (value) => value.split(',').filter(Boolean) },
      CACHE: {
        path: 'cache',
        parse: (value) => {
          if (!['true', 'false', '1', '0'].includes(value))
            throw new Error(`${prefix}_CACHE must be true or false`);
          return value === 'true' || value === '1';
        },
      },
    },
  };
}
