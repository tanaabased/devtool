import shellAsset from '../../lib/shell-assets.ts';
import type { PackageService } from '../../lib/types.ts';

export default async (service: PackageService) => {
  service.addHookFile(shellAsset('packages/git/install-git.sh', service.tmpdir), { hook: 'boot' });
  service.addHookFile(
    `
    if command -v git > /dev/null 2>&1; then
      git config --system --add safe.directory ${service.appMount}
    fi
  `,
    { hook: 'tooling', priority: 0 },
  );
};
