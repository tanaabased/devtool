import type { ProductOptions, ProductConfig } from './types.ts';
import type { Engine } from '../components/engine.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Config from './config.ts';
import configSchemas from './config-schemas.ts';
import clone from '../utils/clone-config.ts';
import App from './app.ts';
import yamlModule from './yaml.ts';

/** Product defaults and explicit overrides are instance-owned; construction performs no host I/O. */
class Runtime {
  overrides: Omit<ProductOptions, 'engine' | 'env' | 'configFile'>;
  engine?: Engine;
  env?: NodeJS.ProcessEnv;
  configFile?: string;
  config: Config<ProductConfig>;
  private resolved?: { revision: number; values: ProductConfig };
  identity: string;
  commandName: string;
  envPrefix: string;

  constructor(options: ProductOptions = {}) {
    const { engine, env, configFile, ...overrides } = options;
    this.overrides = structuredClone(overrides);
    this.engine = engine;
    this.env = env ? { ...env } : undefined;
    this.configFile = configFile;
    this.identity = options.identity ?? 'devtool';
    this.commandName = options.commandName ?? this.identity;
    this.envPrefix = options.envPrefix ?? this.identity.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    this.config = new Config<ProductConfig>({
      schema: configSchemas.product,
      sources: [
        {
          id: 'defaults',
          kind: 'object',
          role: 'defaults',
          data: {
            identity: this.identity,
            commandName: this.commandName,
            envPrefix: this.envPrefix,
            appFiles: ['.devtool.yml', '.devtool.yaml'],
            cache: true,
          },
        },
        ...(configFile
          ? [
              {
                id: 'global',
                kind: 'file' as const,
                role: 'global' as const,
                file: configFile,
                imports: false,
              },
            ]
          : []),
        { id: 'environment', kind: 'object', role: 'environment', data: {} },
        { id: 'caller', kind: 'object', role: 'caller', data: this.overrides },
      ],
    });
  }

  private environmentCaptured = false;

  /** Explicit environment refresh. File changes require config.reloadSource(id). */
  captureEnvironment(values = this.env ?? process.env): void {
    this.config.replaceSource('environment', {
      id: 'environment',
      kind: 'environment',
      role: 'environment',
      prefix: this.envPrefix,
      values,
      fields: {
        COMMAND_NAME: { path: 'commandName' },
        DATA_ROOT: { path: 'dataRoot' },
        CACHE_ROOT: { path: 'cacheRoot' },
        APP_FILES: { path: 'appFiles', parse: (value) => value.split(',').filter(Boolean) },
        CACHE: {
          path: 'cache',
          parse: (value) => {
            if (!['true', 'false', '1', '0'].includes(value))
              throw new Error(`${this.envPrefix}_CACHE must be true or false`);
            return value === 'true' || value === '1';
          },
        },
      },
    });
    this.environmentCaptured = true;
  }

  resolveConfig(): ProductConfig {
    if (!this.environmentCaptured) this.captureEnvironment();
    if (this.resolved?.revision === this.config.revision) return clone(this.resolved.values);
    const config = clone(this.config.compile().values) as ProductConfig;
    config.dataRoot = path.resolve(
      config.dataRoot ?? path.join(os.homedir(), `.${config.identity}`),
    );
    config.cacheRoot = path.resolve(config.cacheRoot ?? path.join(config.dataRoot, 'cache'));
    this.resolved = { revision: this.config.revision, values: config };
    return clone(config);
  }

  /** Load the selected project, rejecting unsupported services before constructing any of them. */
  loadApp({ cwd = process.cwd(), file }: { cwd?: string; file?: string } = {}) {
    const config = this.resolveConfig();
    let appfile = file && path.resolve(cwd, file);
    let directory = path.resolve(cwd);
    while (!appfile) {
      appfile = config.appFiles
        .map((name) => path.join(directory, name))
        .find((candidate) => fs.existsSync(candidate));
      if (appfile || path.dirname(directory) === directory) break;
      directory = path.dirname(directory);
    }
    if (!appfile) throw new Error(`No app file found (${config.appFiles.join(', ')}) from ${cwd}`);
    appfile = fs.realpathSync(appfile);
    const data = yamlModule.load(appfile);
    return new App({ config, data, file: appfile, engine: this.engine });
  }
}

export default Runtime;
