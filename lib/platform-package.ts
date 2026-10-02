/** Packaging targets, not a claim of Docker lifecycle coverage on each platform. */
export const platforms = {
  'linux-x64': { os: ['linux'], cpu: ['x64'], libc: ['glibc'] },
  'darwin-arm64': { os: ['darwin'], cpu: ['arm64'] },
} as const;

export const platformPackage = (
  platform: string = process.platform,
  arch: string = process.arch,
  glibc = platform !== 'linux' ||
    Boolean(
      (process.report.getReport() as { header: { glibcVersionRuntime?: string } }).header
        .glibcVersionRuntime,
    ),
) => {
  const target = `${platform}-${arch}`;
  if (!Object.hasOwn(platforms, target) || (platform === 'linux' && !glibc))
    throw new Error(`Unsupported devtool binary platform: ${target}${glibc ? '' : ' (non-glibc)'}`);
  return `@tanaab/devtool-${target}`;
};
