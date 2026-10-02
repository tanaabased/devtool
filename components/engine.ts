import type { Labels, Command } from './service.ts';

export interface OutputWriter {
  write(chunk: string | Uint8Array): unknown;
}

export interface ExecOptions {
  cwd?: string;
  interactive?: boolean;
  /** Default: all output. Tail mode retains only the last 8,192 characters per stream in results and errors. */
  capture?: 'all' | 'tail';
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
