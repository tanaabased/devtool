import type { EnvironmentSource } from '../components/config.ts';

/** Only declared settings enter configuration; control variables such as CONFIG_DIR stay out. */
export default function productEnvironmentSource(
  prefix: string,
  values: Readonly<NodeJS.ProcessEnv>,
): EnvironmentSource {
  for (const name of ['APP_FILE', 'APP_FILES', 'PRE_FILES', 'POST_FILES']) {
    if (values[`${prefix}_${name}`] !== undefined)
      throw new Error(
        `${prefix}_${name}: app discovery is read-only; set appFile and appFiles when constructing the CLI`,
      );
  }
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
