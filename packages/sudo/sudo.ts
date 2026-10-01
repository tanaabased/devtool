import type { PackageService } from '../../lib/types.ts';
import path from 'node:path';

export default async (service: PackageService) => {
  service.addHookFile(path.join(import.meta.dirname, 'install-sudo.sh'), { hook: 'boot' });
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
