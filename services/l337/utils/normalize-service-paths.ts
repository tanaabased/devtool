import fs from 'node:fs';
import path from 'node:path';
import type {
  ImageConfig,
  MountInput,
  ServiceConfig,
  StringInput,
} from '../../../components/service.ts';
import { ImportString } from '../../../lib/yaml.ts';
import clone from '../../../utils/clone-config.ts';

/** Resolve known host inputs at preparation, retaining container destinations and image names. */
export default function normalizeServicePaths(
  input: ServiceConfig,
  base: (keys: string[]) => string,
  volumes: readonly string[] = [],
): ServiceConfig {
  const config = clone(input);
  const resolve = (value: string, keys: string[]) => path.resolve(base(keys), value);
  const image = (value: StringInput | undefined, keys: string[]) => {
    if (typeof value !== 'string') return value;
    if (value.includes('\n')) return new ImportString(value, { base: base(keys) });
    const file = resolve(value, keys);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? file : value;
  };
  const mounts = (values: MountInput[], keys: string[]) =>
    values.map((value, i) => {
      const location = [...keys, String(i)];
      if (typeof value === 'string') {
        // Split after a possible Windows drive prefix, retaining short syntax for mount matching.
        const offset = /^[A-Za-z]:[\\/]/.test(value) ? 2 : 0;
        const index = value.indexOf(':', offset);
        if (index < 0) return value;
        const source = value.slice(0, index);
        return volumes.includes(source)
          ? value
          : `${resolve(source, location)}${value.slice(index)}`;
      }
      const key = value.source ? 'source' : 'src';
      const source = value[key];
      if (
        source &&
        (value.type === 'bind' ||
          value.type === 'copy' ||
          (!value.type && !volumes.includes(source)))
      )
        value[key] = resolve(source, [...location, key]);
      return value;
    });
  const context = (
    value: NonNullable<ImageConfig['context']>,
    keys: string[],
  ): ImageConfig['context'] => {
    if (Array.isArray(value))
      return value.map(
        (item, i) =>
          context(item, [...keys, String(i)]) as Exclude<
            ImageConfig['context'],
            unknown[] | undefined
          >,
      );
    if (typeof value === 'string') {
      if (/^[a-z]+:\/\//i.test(value)) return { url: value };
      const offset = /^[A-Za-z]:[\\/]/.test(value) ? 2 : 0;
      const index = value.indexOf(':', offset);
      const source = index < 0 ? value : value.slice(0, index);
      return { source: resolve(source, keys), target: index < 0 ? value : value.slice(index + 1) };
    }
    const key = value.source ? 'source' : 'src';
    const source = value[key];
    if (source && !/^[a-z]+:\/\//i.test(source)) {
      value.target ??= value.destination ?? value.dest ?? source;
      value[key] = resolve(source, [...keys, key]);
    }
    return value;
  };
  if (typeof config.build === 'string') config.build = resolve(config.build, ['build']);
  else if (config.build) {
    config.build.context = resolve(
      config.build.context ?? '.',
      config.build.context === undefined ? ['build'] : ['build', 'context'],
    );
  }
  if (typeof config.image === 'string' || config.image instanceof ImportString)
    config.image = image(config.image, ['image']);
  else if (config.image) {
    config.image.imagefile = image(config.image.imagefile, ['image', 'imagefile']);
    if (config.image.dockerfile)
      config.image.dockerfile = image(config.image.dockerfile, ['image', 'dockerfile']) as string;
    if (config.image.context)
      config.image.context = context(config.image.context, ['image', 'context']);
  }
  for (const key of ['volumes', 'mount', 'mounts'] as const)
    if (config[key]) config[key] = mounts(config[key], [key]);
  if (config.overrides?.volumes)
    config.overrides.volumes = mounts(config.overrides.volumes, ['overrides', 'volumes']);
  // Lando interprets relative existing files as scripts; absolute commands are container paths.
  if (config.type === 'lando') {
    for (const key of ['ca', 'cas', 'certificate-authority', 'certificate-authorities'] as const) {
      const value = config.security?.[key];
      if (value !== undefined)
        config.security![key] = Array.isArray(value)
          ? value.map((item, i) => image(item, ['security', key, String(i)])!)
          : image(value, ['security', key]);
    }
    for (const key of ['command', 'entrypoint'] as const) {
      const value = config[key];
      if (typeof value !== 'string' || path.isAbsolute(value) || value.includes('\n')) continue;
      const file = resolve(value, [key]);
      if (fs.existsSync(file) && fs.statSync(file).isFile())
        config[key] = new ImportString(fs.readFileSync(file, 'utf8'), {
          file,
        }) as unknown as string;
    }
  }
  return config;
}
