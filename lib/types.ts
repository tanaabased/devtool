import type { Engine } from '../components/engine.ts';
import type { ServiceConfig, ComposeService, ServiceInfo } from '../components/service.ts';

export interface ProductOptions {
  identity?: string;
  commandName?: string;
  envPrefix?: string;
  appFiles?: string[];
  dataRoot?: string;
  cacheRoot?: string;
  cache?: boolean;
  configFile?: string;
  env?: NodeJS.ProcessEnv;
  engine?: Engine;
  uid?: number | string;
  gid?: number | string;
  username?: string;
  npmrc?: string | Record<string, string | number | boolean>;
}

export interface ProductConfig extends Omit<ProductOptions, 'engine' | 'env' | 'configFile'> {
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
