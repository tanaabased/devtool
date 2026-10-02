import shellAsset from '../../lib/shell-assets.ts';
import { ImportString } from '../../components/yaml.ts';
import type { PackageService, SecurityConfig } from '../../lib/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import isStringy from '../../utils/is-stringy.ts';
import { createHash } from 'node:crypto';

export default async (service: PackageService, input: unknown) => {
  const security = input as SecurityConfig;
  // right now this is mostly just CA setup, lets munge it all together and normalize and whatever
  const cas = [
    security.ca,
    security.cas,
    security['certificate-authority'],
    security['certificate-authorities'],
  ]
    .flat()
    .filter((cert) => isStringy(cert))
    .map((cert) => {
      // if ImportString then just return the filename
      if (cert instanceof ImportString) {
        const { file } = cert.getMetadata();
        cert = file ?? String(cert);
      }

      // if a single liner then resolve the path
      if (cert.split('\n').length === 1) {
        cert = path.resolve(service.appRoot, String(cert));
      }

      return String(cert);
    })
    .filter((cert) => cert.split('\n').length > 1 || fs.existsSync(cert));

  // add ca-cert install hook if we have some to add
  if (cas.length > 0) {
    service.addHookFile(shellAsset('packages/security/install-ca-certs.sh', service.tmpdir), {
      hook: 'boot',
    });
  }

  // inject them
  for (const ca of cas) {
    const file =
      ca.split('\n').length > 1
        ? `LandoCA-${createHash('sha256').update(ca).digest('hex').slice(0, 12)}.crt`
        : path.basename(ca);
    service.addLSF(ca, `ca-certificates/${file}`);
  }
};
