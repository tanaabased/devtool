import type { ImportString } from '../lib/yaml.ts';
import type { BuildSource, ServiceEngine } from './engine.ts';
import type { ComposeData, ProductConfig, Resource } from '../lib/types.ts';
import type { Debugger } from 'debug';

export type StringInput = string | ImportString;

export type Disabled = false | 0 | null | undefined;

export type Command = string | string[];

export type Environment = Record<string, string | number | boolean | null | undefined>;

export type Labels = Record<string, string>;

export interface UserConfig {
  name?: string;
  uid?: number | string;
  gid?: number | string;
  user?: string;
  username?: string;
}

export interface ServiceUser extends UserConfig {
  name: string;
  uid: string | number;
  gid: string | number;
}

export interface Mount {
  source: string;
  target: string;
  type?: string;
  read_only?: boolean;
  bind?: { create_host_path?: boolean };
  src?: string;
  dest?: string;
  destination?: string;
  content?: string;
  contents?: string;
  group?: string;
  user?: string;
  include?: string | string[];
  includes?: string | string[];
  exclude?: string | string[];
  excludes?: string | string[];
  scope?: string;
  owner?: string;
  permissions?: string;
  perms?: string;
  labels?: Labels;
  id?: string;
  name?: string;
  dir?: string;
}

export type MountInput = string | Partial<Mount>;

export interface Port {
  target?: number;
  published?: string | number;
  protocol?: string;
  app_protocol?: string;
  host_ip?: string;
}

export interface Step {
  group?: string;
  user?: string;
  stage?: string;
  weight?: number;
  offset?: number;
  instructions: string | DockerInstruction[];
  contexted?: boolean;
}

export interface BuildGroup {
  id?: string;
  name?: string;
  description?: string;
  stage?: string;
  weight?: number;
  user?: string;
}

export interface NormalizedStep extends Step {
  group: string;
  user: string;
  stage: string;
  weight: number;
}

export type DockerInstruction = Record<string, unknown>;

export interface ImageConfig {
  imagefile?: StringInput;
  dockerfile?: string;
  args?: BuildArgs;
  context?: string | Partial<BuildSource> | (string | Partial<BuildSource>)[];
  groups?: BuildGroup | BuildGroup[];
  steps?: Step | Step[];
  ssh?: boolean | { agent?: string | boolean; keys?: boolean | string | string[] };
  tag?: string;
  buildkit?: boolean;
  buildx?: boolean;
}

export type BuildArgs =
  string | (string | [string, unknown] | null | undefined)[] | Record<string, unknown>;

export interface BuildConfig {
  context?: string;
  dockerfile?: string;
  args?: BuildArgs;
  app?: string;
  image?: string;
}

export interface SecurityConfig {
  ca?: StringInput | StringInput[];
  cas?: StringInput | StringInput[];
  'certificate-authority'?: StringInput | StringInput[];
  'certificate-authorities'?: StringInput | StringInput[];
}

export type CertConfig = boolean | string | { cert: string | string[]; key?: string | string[] };

export type Healthcheck =
  | Disabled
  | string
  | string[]
  | { command?: Command; cmd?: Command; retry?: number; delay?: number; user?: string };

export interface ComposeService {
  image?: StringInput | ImageConfig;
  build?: string | BuildConfig;
  command?: Command | Disabled;
  entrypoint?: Command | Disabled;
  user?: string | UserConfig | Disabled;
  ports?: (string | number | Port)[];
  volumes?: MountInput[];
  environment?: Environment | string[];
  labels?: Labels | string[];
  working_dir?: string;
  networks?: Record<string, { aliases?: string[] }>;
  extra_hosts?: string[];
  logging?: { driver: string; options?: Record<string, string> };
  container_name?: string;
  network_mode?: string;
  external_links?: string[];
  volumes_from?: string[];
  [option: string]: unknown;
}

export interface ServiceConfig extends ComposeService {
  type?: 'l337' | 'lando';
  api?: number;
  primary?: boolean;
  appMount?: MountInput | Disabled;
  appmount?: MountInput | Disabled;
  'app-mount'?: MountInput | Disabled;
  certs?: CertConfig;
  healthcheck?: Healthcheck;
  hostnames?: string[];
  mount?: MountInput[];
  mounts?: MountInput[];
  storage?: MountInput[];
  'persistent-storage'?: MountInput[];
  packages?: Record<string, unknown>;
  security?: SecurityConfig;
  overrides?: ComposeService;
}

export type ImageState = 'UNBUILT' | 'BUILDING' | 'BUILT' | 'BUILD FAILURE';

export type AppState = 'UNBUILT' | 'BUILDING' | 'BUILT' | 'BUILD FAILURE';

export interface ServiceInfo {
  hostnames?: string[];
  api?: number;
  service?: string;
  type?: string;
  primary?: boolean;
  state: { IMAGE: ImageState; APP?: AppState };
  healthy?: boolean | 'unknown';
  tag?: string;
  image?: string;
  user?: string | UserConfig | Disabled;
  appMount?: string;
  error?: string;
}

export type ServiceInfoUpdate = Omit<Partial<ServiceInfo>, 'state'> & {
  state?: Partial<ServiceInfo['state']>;
};

export interface ComposeFragment {
  id?: string;
  info?: ServiceInfo;
  data: ComposeData[];
}

export interface ServiceApp {
  labels?: Labels;
  file?: string;
  root?: string;
  project: string;
  info: ServiceInfo[];
  add(fragment: ComposeFragment): void;
}

export interface ServiceHost {
  debuggy?: boolean;
  config: ProductConfig & {
    userConfRoot: string;
    uid: number | string;
    gid: number | string;
    username: string;
    caCert: string;
    networkBridge: string;
    storageNamespace: string;
    isInteractive?: boolean;
    leia?: boolean;
  };
  generateCert(
    name: string,
    options?: { domains?: string[] },
  ): Promise<{ certPath: string; keyPath: string }>;
}

export interface ServiceOptions {
  appRoot?: string;
  context?: string;
  config?: ServiceConfig;
  engine?: ServiceEngine;
  debug?: Debugger;
  groups?: Record<string, BuildGroup>;
  info?: ServiceInfoUpdate;
  name?: string;
  primary?: boolean;
  project?: string;
  sshKeys?: string[];
  sshSocket?: string | false;
  stages?: Record<string, string>;
  states?: Partial<ServiceInfo['state']>;
  tag?: string;
  tlvolumes?: Record<string, Resource>;
  tmpdir?: string;
  type?: string;
  user?: string;
  router?: unknown;
}
