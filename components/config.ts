/** Schema keys may use kebab-case or camelCase. Unspecified keys remain literal. */
export interface ConfigSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean';
  nullable?: boolean;
  /** Resolve string paths against the owning source, never arbitrary string values. */
  path?: boolean;
  properties?: Record<string, ConfigSchema>;
  /** Schema for dictionary values; dictionary keys themselves are never converted. */
  values?: ConfigSchema;
  items?: ConfigSchema;
  required?: readonly string[];
  /** App overlays cannot supply this field. SDK persistence must require force. */
  protected?: boolean;
  validate?: (value: unknown) => void;
}

export type ConfigPath = string | readonly string[];
export type ConfigRole =
  'defaults' | 'plugin-defaults' | 'global' | 'app' | 'environment' | 'caller';
export type ConfigFormat = 'yaml' | 'json' | 'javascript';

interface SourceBase {
  id: string;
  role?: ConfigRole;
  base?: string;
}
export interface ObjectSource extends SourceBase {
  kind: 'object';
  data: object;
}
export interface FileSource extends SourceBase {
  kind: 'file';
  file: string;
  format?: ConfigFormat;
  optional?: boolean;
  writable?: boolean;
  /** Product YAML can opt out of app import tags. */
  imports?: boolean;
}
export interface EnvironmentSource extends SourceBase {
  kind: 'environment';
  prefix: string;
  /** Captured by value on ingestion. Config never reads process.env implicitly. */
  values: Record<string, string | undefined>;
  fields: Record<string, { path: ConfigPath; parse?: (value: string) => unknown }>;
}
export type ConfigSource = ObjectSource | FileSource | EnvironmentSource;
export interface SourceInfo {
  id: string;
  kind: ConfigSource['kind'];
  role?: ConfigRole;
  revision: number;
  file?: string;
  base?: string;
  writable: boolean;
  dependencies: readonly string[];
}
export interface ConfigOrigin {
  source: string;
  revision: number;
  file?: string;
  /** Original imported file, when the value came through a YAML import. */
  importedFrom?: string;
}
export type ConfigReadonly<T> = T extends readonly (infer U)[]
  ? readonly ConfigReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: ConfigReadonly<T[K]> }
    : T;
export interface ConfigSnapshot<T> {
  readonly revision: number;
  readonly values: ConfigReadonly<T>;
  readonly sources: readonly SourceInfo[];
}
