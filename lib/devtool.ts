import type { ProductOptions } from './types.ts';
import Runtime from './runtime.ts';
import metadata from '../package.json';

/** Create an inert, independently configured runtime. loadApp performs explicit I/O. */
export const createDevtool = (options: ProductOptions = {}) => new Runtime(options);
export const name = 'devtool';
export const version = metadata.version;

export type {
  ProductOptions,
  ProductConfig,
  Engine,
  ExecOptions,
  ExecResult,
  AppConfig,
  ServiceConfig,
  ServiceInfo,
  AppInfo,
  PersistedState,
  ServiceRecord,
  BuildOptions,
  ImageInfo,
  Volume,
  VolumeInput,
} from './types.ts';
export type { ExecutionError } from '../utils/as-error.ts';
export type { default as Runtime } from './runtime.ts';
export type { default as App } from './app.ts';
