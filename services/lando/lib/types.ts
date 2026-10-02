import type {
  ServiceConfig,
  MountInput,
  SecurityConfig,
  StringInput,
  ComposeService,
  Disabled,
  ServiceUser,
  Step,
} from '../../../components/service.ts';

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
