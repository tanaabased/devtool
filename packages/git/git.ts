import type { PackageService } from '../../lib/types.ts';
import path from 'node:path';

export default async (service: PackageService) => {
  service.addHookFile(path.join(import.meta.dirname, 'install-git.sh'), { hook: 'boot' });
  service.addHookFile(
    `
    if command -v git > /dev/null 2>&1; then
      git config --system --add safe.directory ${service.appMount}
    fi
  `,
    { hook: 'tooling', priority: 0 },
  );
};
