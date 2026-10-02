import type { ProductOptions, ProductConfig } from './types.ts';
import type { Engine } from '../components/engine.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import App from './app.ts';
import yamlModule from './yaml.ts';

const fields = {
  COMMAND_NAME: 'commandName',
  DATA_ROOT: 'dataRoot',
  CACHE_ROOT: 'cacheRoot',
  APP_FILES: 'appFiles',
  CACHE: 'cache',
};

/** Product defaults and explicit overrides are instance-owned; construction performs no host I/O. */
class Runtime {
  overrides: Omit<ProductOptions, 'engine' | 'env' | 'configFile'>;
  engine?: Engine;
  env?: NodeJS.ProcessEnv;
  configFile?: string;
  identity: string;
  commandName: string;
  envPrefix: string;

  constructor(options: ProductOptions = {}) {
    const { engine, env, configFile, ...overrides } = options;
    this.overrides = structuredClone(overrides);
    this.engine = engine;
    this.env = env;
    this.configFile = configFile;
    this.identity = options.identity ?? 'devtool';
    this.commandName = options.commandName ?? this.identity;
    this.envPrefix = options.envPrefix ?? this.identity.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  resolveConfig(): ProductConfig {
    const file = this.configFile ? yaml.load(fs.readFileSync(this.configFile, 'utf8')) : {};
    if (file && (typeof file !== 'object' || Array.isArray(file)))
      throw new Error('Product configuration must be an object');
    const environment: Partial<ProductConfig> = {};
    const env = this.env ?? process.env;
    for (const [suffix, key] of Object.entries(fields)) {
      const value = env[`${this.envPrefix}_${suffix}`];
      if (value === undefined) continue;
      if (key === 'cache') {
        if (!['true', 'false', '1', '0'].includes(value))
          throw new Error(`${this.envPrefix}_CACHE must be true or false`);
        environment[key] = value === 'true' || value === '1';
      } else if (key === 'appFiles') environment.appFiles = value.split(',').filter(Boolean);
      else if (key === 'commandName' || key === 'dataRoot' || key === 'cacheRoot')
        environment[key] = value;
    }
    const config = {
      identity: this.identity,
      commandName: this.commandName,
      envPrefix: this.envPrefix,
      appFiles: ['.devtool.yml', '.devtool.yaml'],
      cache: true,
      ...(file as Partial<ProductConfig>),
      ...environment,
      ...this.overrides,
    } as ProductConfig;
    for (const key of ['identity', 'commandName', 'envPrefix'] as const) {
      if (typeof config[key] !== 'string') throw new Error(`${key} must be a string`);
    }
    for (const key of ['dataRoot', 'cacheRoot', 'username'] as const) {
      if (config[key] !== undefined && typeof config[key] !== 'string')
        throw new Error(`${key} must be a string`);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.identity))
      throw new Error('Invalid product identity');
    if (
      !Array.isArray(config.appFiles) ||
      !config.appFiles.length ||
      config.appFiles.some((file) => typeof file !== 'string' || path.basename(file) !== file)
    ) {
      throw new Error('appFiles must be a nonempty list of filenames');
    }
    if (typeof config.cache !== 'boolean') throw new Error('cache must be a boolean');
    config.dataRoot = path.resolve(
      config.dataRoot ?? path.join(os.homedir(), `.${config.identity}`),
    );
    config.cacheRoot = path.resolve(config.cacheRoot ?? path.join(config.dataRoot, 'cache'));
    return config;
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
