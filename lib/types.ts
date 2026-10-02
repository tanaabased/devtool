import type { Debugger } from 'debug';
import type { ImportString } from '../components/yaml.ts';

export type StringInput = string | ImportString;
export type Disabled = false | 0 | null | undefined;
export type Command = string | string[];
export type Environment = Record<string, string | number | boolean | null | undefined>;
export type Labels = Record<string, string>;
export interface OutputWriter {
  write(chunk: string | Uint8Array): unknown;
}
export interface ExecOptions {
  cwd?: string;
  interactive?: boolean;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
  env?: NodeJS.ProcessEnv;
}
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}
export interface Volume {
  Name: string;
  Labels?: Labels;
}
export interface VolumeInput {
  Name: string;
  Labels: Labels;
}
export interface ImageInfo {
  Config?: { Cmd?: string[] | null; Entrypoint?: Command | null };
  ContainerConfig?: { Cmd?: string[] | null; Entrypoint?: Command | null };
}
export interface BuildSource {
  source: string;
  target: string;
  url?: string;
  instructions?: string | string[];
  owner?: string;
  permissions?: string;
  group?: string;
  user?: string;
  perms?: string;
  src?: string;
  dest?: string;
  destination?: string;
}
export interface BuildOptions {
  tag?: string;
  id?: string;
  context?: string;
  sources?: BuildSource[];
  excludePaths?: string[];
  buildArgs?: Record<string, string>;
  attach?: boolean;
  ignoreReturnCode?: boolean;
  sshKeys?: string[];
  sshSocket?: string | false;
  stderr?: string;
  stdout?: string;
}
export interface BuildContext extends BuildOptions {
  id: string;
  context: string;
  imagefile: string;
  sources: BuildSource[];
  tag?: string;
}
/** Structural injection contract; callers do not need to inherit the Docker adapter. */
export interface Engine {
  build(file: string, options: BuildOptions): PromiseLike<unknown>;
  buildx(file: string, options: BuildOptions): PromiseLike<unknown>;
  getImage(tag: string): { inspect(): Promise<ImageInfo> };
  imageExists(tag: string): Promise<boolean>;
  compose(
    project: string,
    file: string,
    args: string[],
    options?: ExecOptions,
  ): Promise<ExecResult>;
  listVolumes(): Promise<{ Volumes: Volume[] }>;
  createVolume(options: VolumeInput): Promise<unknown>;
  getVolume(name: string): { id?: string; remove(options?: { force?: boolean }): Promise<unknown> };
}
export interface ServiceEngine extends Omit<Engine, 'compose' | 'imageExists'> {
  run(command: string[], options: RunOptions): Promise<ExecResult>;
}
export interface RunOptions {
  createOptions: {
    User: string;
    Entrypoint: string[];
    Env?: string[];
    Labels?: Labels;
    WorkingDir?: string;
    HostConfig?: { Binds: string[] };
  };
}
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
export interface LandoConfig extends ServiceConfig {
  hostnames: string[];
  mount: MountInput[];
  mounts: MountInput[];
  storage: MountInput[];
  'persistent-storage': MountInput[];
  packages: Record<string, unknown>;
  security: SecurityConfig & { cas: StringInput[] };
  overrides: ComposeService;
  volumes: MountInput[];
}
export interface PackageService {
  tmpdir: string;
  id: string;
  project: string;
  appRoot: string;
  appMount?: MountInput | Disabled;
  user: ServiceUser;
  hostnames: string[];
  generateCert(
    name: string,
    options?: { domains?: string[] },
  ): Promise<{ certPath: string; keyPath: string }>;
  addHookFile(
    file: StringInput,
    options?: { id?: string; hook?: string; stage?: string; priority?: string | number },
  ): void;
  addLSF(source: StringInput, dest?: string, options?: { context?: string }): string;
  addSteps(steps: Step | Step[]): void;
  addLandoServiceData(data?: ComposeService): void;
}
export type PackageInstaller = (service: PackageService, data?: unknown) => Promise<void>;
