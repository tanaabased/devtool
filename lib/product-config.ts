import os from 'node:os';
import path from 'node:path';
import type { ProductOptions, ProductSettings, ProductConfigContext } from './types.ts';
import type { ConfigSource } from '../components/config.ts';
import Config from './config.ts';
import configSchemas from './config-schemas.ts';
import configTemplateSource from '../utils/config-template-source.ts';
import productEnvironmentSource from '../utils/product-environment-source.ts';

/** Explicitly capture product context and assemble sources. Files load only on compile(). */
export default function createProductConfig(
  options: ProductOptions = {},
  context: Partial<ProductConfigContext> = {},
): Config<ProductSettings> {
  const {
    configFile,
    configDir: requestedDir,
    configFiles = {},
    defaults,
    env: suppliedEnv,
    engine: _engine,
    ...caller
  } = options;
  const root = path.resolve(context.root ?? process.cwd());
  const home = path.resolve(context.home ?? os.homedir());
  const platform = context.platform ?? process.platform;
  const env = Object.freeze({ ...(context.env ?? suppliedEnv ?? process.env) });
  const identity = options.identity ?? 'devtool';
  const commandName = options.commandName ?? identity;
  const envPrefix = options.envPrefix ?? identity.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const configDir = path.resolve(
    root,
    requestedDir ?? env[`${envPrefix}_CONFIG_DIR`] ?? path.join(home, `.${identity}`),
  );
  const systemDir =
    platform === 'win32' ? (env.ProgramData ?? path.join(home, 'AppData', 'Local')) : '/etc';
  const files = {
    system: configFiles.system ?? path.join(systemDir, identity, 'config.yaml'),
    managed: configFiles.managed ?? path.join(configDir, 'config.json'),
    user: configFiles.user ?? path.join(configDir, 'config.yaml'),
  };
  const sources: ConfigSource[] = [
    {
      id: 'defaults',
      kind: 'object',
      role: 'defaults',
      data: {
        identity,
        commandName,
        envPrefix,
        appFiles: ['.devtool.yml', '.devtool.yaml'],
        cache: true,
        dataRoot: path.join(home, `.${identity}`),
      },
    },
  ];
  if (defaults !== undefined)
    sources.push({
      ...configTemplateSource(
        defaults,
        Object.freeze({ root, home, platform, env, identity, configDir }),
        'default-template',
      ),
      role: 'defaults',
    });
  for (const [id, file] of Object.entries(files)) {
    if (file !== false)
      sources.push({
        id,
        kind: 'file',
        role: 'global',
        file,
        optional: true,
        writable: id === 'managed',
        imports: false,
      });
  }
  sources.push(productEnvironmentSource(envPrefix, env));
  if (configFile !== undefined)
    sources.push({
      id: 'explicit',
      kind: 'file',
      role: 'caller',
      file: configFile,
      imports: false,
    });
  sources.push({ id: 'caller', kind: 'object', role: 'caller', data: caller });
  return new Config<ProductSettings>({ root, schema: configSchemas.runtime, sources });
}
