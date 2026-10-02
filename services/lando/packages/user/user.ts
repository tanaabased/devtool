import shellAsset from '../../lib/shell-assets.ts';
import type { PackageService } from '../../lib/types.ts';
import type { ServiceUser } from '../../../../components/service.ts';
import parsePkginstallOpts from '../../utils/parse-pkginstall-opts.ts';

export default async (service: PackageService, input: unknown) => {
  const user = input as ServiceUser;
  service.addLSF(shellAsset('packages/user/add-user.sh', service.tmpdir));
  service.addHookFile(shellAsset('packages/user/install-useradd.sh', service.tmpdir), {
    hook: 'boot',
    priority: 10,
  });
  service.addSteps({
    group: 'setup-user',
    instructions: `
    RUN /etc/lando/add-user.sh ${parsePkginstallOpts(user)}`,
  });
  service.addLandoServiceData({
    environment: {
      LANDO_USER: user.name,
      LANDO_GID: user.gid,
      LANDO_UID: user.uid,
    },
  });
};
