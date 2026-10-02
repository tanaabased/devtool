import type { ExecOptions, ImageInfo, Volume, VolumeInput, BuildOptions } from './types.ts';
import asError from '../utils/as-error.ts';
import type DockerEngine from '../components/docker-engine.ts';
import execute from '../utils/execute.ts';

/** Use the existing Docker CLI/context; load image-building support only when needed. */
class Engine {
  private builder?: Promise<DockerEngine>;

  private getBuilder() {
    this.builder ??= import('../components/docker-engine.ts').then(
      ({ default: DockerEngine }) => new DockerEngine({}, { builder: 'docker' }),
    );
    return this.builder;
  }

  async build(file: string, options: BuildOptions) {
    return (await this.getBuilder()).build(file, options);
  }
  async buildx(file: string, options: BuildOptions) {
    return (await this.getBuilder()).buildx(file, options);
  }

  getImage(tag: string) {
    return {
      inspect: async () => {
        const result = await execute('docker', ['image', 'inspect', tag]);
        return JSON.parse(result.stdout)[0] as ImageInfo;
      },
    };
  }

  async imageExists(tag: string) {
    try {
      await this.getImage(tag).inspect();
      return true;
    } catch (caught) {
      const error = asError(caught);
      if (/No such image|No such object/i.test(error.stderr ?? '')) return false;
      throw error;
    }
  }

  compose(project: string, file: string, args: string[], options: ExecOptions = {}) {
    return execute(
      'docker',
      ['compose', '--project-name', project, '--file', file, ...args],
      options,
    );
  }

  async listVolumes(): Promise<{ Volumes: Volume[] }> {
    const result = await execute('docker', ['volume', 'ls', '--quiet']);
    const names = result.stdout.trim().split('\n').filter(Boolean);
    if (!names.length) return { Volumes: [] };
    return {
      Volumes: JSON.parse((await execute('docker', ['volume', 'inspect', ...names])).stdout),
    };
  }

  async createVolume({ Name, Labels }: VolumeInput) {
    const existing = (await this.listVolumes()).Volumes.find((volume) => volume.Name === Name);
    if (existing) {
      if (Object.entries(Labels).some(([key, value]) => existing.Labels?.[key] !== value))
        throw new Error(`Storage ownership mismatch: ${Name}`);
      return existing;
    }
    await execute('docker', [
      'volume',
      'create',
      ...Object.entries(Labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
      Name,
    ]);
  }

  getVolume(name: string) {
    return { remove: () => execute('docker', ['volume', 'rm', name]) };
  }
}

export default Engine;
