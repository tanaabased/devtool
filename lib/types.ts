import type { ServiceConfig, ComposeService, ServiceInfo } from '../components/service.ts';
import type { ConfigTemplate } from '../components/config.ts';

export interface ProductSettings {
  identity?: string;
  commandName?: string;
  envPrefix?: string;
  appFiles?: string[];
  dataRoot?: string;
  cacheRoot?: string;
  cache?: boolean;
  uid?: number | string;
  gid?: number | string;
  username?: string;
  npmrc?: string | Record<string, string | number | boolean>;
}

export interface ProductConfigContext {
  root: string;
  home: string;
  platform: NodeJS.Platform;
  env: Readonly<NodeJS.ProcessEnv>;
}

export interface ProductTemplateContext extends ProductConfigContext {
  identity: string;
  configDir: string;
}

export interface ProductOptions extends ProductSettings {
  /** Explicit invocation file; takes precedence over environment settings. */
  configFile?: string;
  /** Defaults to ~/.<identity>; DEVTOOL_CONFIG_DIR (or the product prefix) also selects it. */
  configDir?: string;
  /** Optional conventional files. false disables an individual source. */
  configFiles?: { system?: string | false; managed?: string | false; user?: string | false };
  defaults?: ConfigTemplate<ProductTemplateContext>;
  env?: NodeJS.ProcessEnv;
}

export interface ProductConfig extends ProductSettings {
  identity: string;
  commandName: string;
  envPrefix: string;
  appFiles: string[];
  dataRoot: string;
  cacheRoot: string;
  cache: boolean;
}

export interface Resource {
  name?: string;
  external?: boolean;
  [option: string]: unknown;
}

export interface AppConfig {
  config?: ProductSettings;
  tooling?: Record<string, unknown>;
  name?: string;
  services: Record<string, ServiceConfig>;
  networks?: Record<string, Resource>;
  volumes?: Record<string, Resource>;
}

export interface ComposeData {
  services?: Record<string, ComposeService>;
  networks?: Record<string, Resource>;
  volumes?: Record<string, Resource>;
}

export interface ServiceRecord {
  fingerprint: string;
  tag: string;
  imageReused?: boolean;
  appFingerprint?: string;
  appBuilt?: boolean;
  healthy?: boolean | 'unknown';
}

export interface PersistedState {
  project?: string;
  services: Record<string, ServiceRecord>;
  running?: boolean;
}

export interface AppInfo {
  project: string;
  root: string;
  running: boolean;
  services: ServiceInfo[];
}
