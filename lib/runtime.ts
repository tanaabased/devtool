import type { ProductOptions, ProductConfig, ProductSettings } from './types.ts';
import type { Engine } from '../components/engine.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Config from './config.ts';
import createProductConfig from './product-config.ts';
import productEnvironmentSource from '../utils/product-environment-source.ts';
import clone from '../utils/clone-config.ts';
import App from './app.ts';
import yamlModule from './yaml.ts';

/** Product defaults and explicit overrides are instance-owned; construction performs no host I/O. */
class Runtime {
  overrides: Omit<ProductOptions, 'engine' | 'env' | 'configFile'>;
  engine?: Engine;
  env?: NodeJS.ProcessEnv;
  configFile?: string;
  private productConfig?: Config<ProductSettings>;
  private root = path.resolve('.');

  /** Explicit configuration access captures host context; construction stays inert. */
  get config(): Config<ProductSettings> {
    return (this.productConfig ??= createProductConfig(
      { ...this.overrides, configFile: this.configFile, env: this.env },
      { root: this.root },
    ));
  }
  private resolved?: { revision: number; values: ProductConfig };
  identity: string;
  commandName: string;
  envPrefix: string;

  constructor(options: ProductOptions = {}) {
    const { engine, env, configFile, ...overrides } = options;
    this.overrides = clone(overrides);
    this.engine = engine;
    this.env = env ? { ...env } : undefined;
    this.configFile = configFile;
    this.identity = options.identity ?? 'devtool';
    this.commandName = options.commandName ?? this.identity;
    this.envPrefix = options.envPrefix ?? this.identity.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  /** Explicit environment refresh. File changes require config.reloadSource(id). */
  captureEnvironment(values = this.env ?? process.env): void {
    this.config.replaceSource('environment', productEnvironmentSource(this.envPrefix, values));
  }

  resolveConfig(): ProductConfig {
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
