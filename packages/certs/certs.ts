import type { PackageService, CertConfig } from '../../lib/types.ts';
import path from 'node:path';
import uniq from 'lodash/uniq.js';

export default async (service: PackageService, input: unknown) => {
  let certs = input as CertConfig;
  if (certs === true) certs = '/etc/lando/certs/cert.crt';
  if (typeof certs === 'string') certs = { cert: certs };
  if (!certs || typeof certs !== 'object') throw new Error('Invalid certificate configuration');
  const cert = typeof certs.cert === 'string' ? [certs.cert] : certs.cert;
  const key =
    certs.key === undefined
      ? [path.posix.join(path.dirname(cert[0]), 'cert.key')]
      : typeof certs.key === 'string'
        ? [certs.key]
        : certs.key;
  // generate certs
  const { certPath, keyPath } = await service.generateCert(`${service.id}.${service.project}`, {
    domains: [...service.hostnames, service.id],
  });

  // build the volumes
  const volumes = uniq([
    ...cert.map((file) => `${certPath}:${file}:ro`),
    ...key.map((file) => `${keyPath}:${file}:ro`),
    `${certPath}:/etc/lando/certs/cert.crt:ro`,
    `${keyPath}:/etc/lando/certs/cert.key:ro`,
  ]);

  // add things
  service.addLandoServiceData({
    volumes,
    environment: {
      LANDO_SERVICE_CERT: cert[0],
      LANDO_SERVICE_KEY: key[0],
    },
  });
};
