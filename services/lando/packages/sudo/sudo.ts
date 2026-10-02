import shellAsset from '../../lib/shell-assets.ts';
import type { PackageService } from '../../lib/types.ts';

export default async (service: PackageService) => {
  service.addHookFile(shellAsset('packages/sudo/install-sudo.sh', service.tmpdir), {
    hook: 'boot',
  });
  service.addSteps({
    group: 'setup-user-1-after',
    instructions: `
    RUN touch /etc/sudoers
    RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
    RUN getent group sudo > /dev/null || groupadd sudo
    RUN usermod -aG sudo ${service.user.name}
  `,
  });
};
