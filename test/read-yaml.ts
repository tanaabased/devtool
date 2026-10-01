import yaml from 'js-yaml';
import type {
  AppConfig,
  BuildConfig,
  ComposeService,
  Environment,
  Labels,
  Mount,
} from '../lib/types.ts';

/** Expected shape of the controlled app/Compose fixtures; assertions check their actual contents. */
export type FixtureDocument = Omit<AppConfig, 'services' | 'networks'> & {
  networks: NonNullable<AppConfig['networks']>;
  services: Record<
    string,
    Omit<
      ComposeService,
      'image' | 'build' | 'volumes' | 'environment' | 'labels' | 'command' | 'entrypoint'
    > & {
      image: string;
      build: BuildConfig;
      volumes: Mount[];
      environment: Environment;
      labels: Labels;
      command: string[];
      entrypoint: string[];
    }
  >;
};
export const load = (data: string): FixtureDocument => yaml.load(data) as FixtureDocument;
export const dump = yaml.dump;
