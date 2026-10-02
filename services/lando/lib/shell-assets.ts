import path from 'node:path';
import materialize from '../../../utils/materialize-asset.ts';
import installGit from '../packages/git/install-git.sh' with { type: 'file' };
import installCaCerts from '../packages/security/install-ca-certs.sh' with { type: 'file' };
import checkSshAgent from '../packages/ssh-agent/check-ssh-agent.sh' with { type: 'file' };
import installSocat from '../packages/ssh-agent/install-socat.sh' with { type: 'file' };
import installSshAdd from '../packages/ssh-agent/install-ssh-add.sh' with { type: 'file' };
import installSudo from '../packages/sudo/install-sudo.sh' with { type: 'file' };
import addUser from '../packages/user/add-user.sh' with { type: 'file' };
import installUseradd from '../packages/user/install-useradd.sh' with { type: 'file' };
import boot from '../scripts/boot.sh' with { type: 'file' };
import entrypoint from '../scripts/entrypoint.sh' with { type: 'file' };
import environment from '../scripts/environment.sh' with { type: 'file' };
import execMultiliner from '../scripts/exec-multiliner.sh' with { type: 'file' };
import exec from '../scripts/exec.sh' with { type: 'file' };
import installBash from '../scripts/install-bash.sh' with { type: 'file' };
import installUpdates from '../scripts/install-updates.sh' with { type: 'file' };
import landorc from '../scripts/landorc.sh' with { type: 'file' };
import lash from '../scripts/lash.sh' with { type: 'file' };
import runHooks from '../scripts/run-hooks.sh' with { type: 'file' };
import utils from '../scripts/utils.sh' with { type: 'file' };

export const shellAssets = {
  'packages/git/install-git.sh': installGit,
  'packages/security/install-ca-certs.sh': installCaCerts,
  'packages/ssh-agent/check-ssh-agent.sh': checkSshAgent,
  'packages/ssh-agent/install-socat.sh': installSocat,
  'packages/ssh-agent/install-ssh-add.sh': installSshAdd,
  'packages/sudo/install-sudo.sh': installSudo,
  'packages/user/add-user.sh': addUser,
  'packages/user/install-useradd.sh': installUseradd,
  'scripts/boot.sh': boot,
  'scripts/entrypoint.sh': entrypoint,
  'scripts/environment.sh': environment,
  'scripts/exec-multiliner.sh': execMultiliner,
  'scripts/exec.sh': exec,
  'scripts/install-bash.sh': installBash,
  'scripts/install-updates.sh': installUpdates,
  'scripts/landorc.sh': landorc,
  'scripts/lash.sh': lash,
  'scripts/run-hooks.sh': runHooks,
  'scripts/utils.sh': utils,
} as const;

/** Ordinary library files; only the standalone CLI extracts its embedded copy. */
export default (id: keyof typeof shellAssets, directory: string) => {
  if (!Bun.isStandaloneExecutable) return path.resolve(import.meta.dirname, '..', id);
  return materialize(shellAssets[id], path.join(directory, 'assets', id));
};
