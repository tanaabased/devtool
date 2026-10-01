import { createHash, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const valid = (file: string) => {
  try {
    return Date.parse(new X509Certificate(fs.readFileSync(file)).validTo) > Date.now() + 86400000;
  } catch {
    return false;
  }
};

/** Project-owned CA and service certificates; never modifies host trust. */
export default class Certificates {
  directory: string;
  identity: string;
  caCert: string;
  caKey: string;
  constructor(directory: string, identity: string) {
    this.directory = directory;
    this.identity = identity;
    this.caCert = path.join(directory, 'ca.crt');
    this.caKey = path.join(directory, 'ca.key');
  }

  async ensureCA() {
    const { createCA } = await import('mkcert');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (!valid(this.caCert) || !fs.existsSync(this.caKey)) {
      const ca = await createCA({
        organization: this.identity,
        countryCode: 'US',
        state: 'Local',
        locality: 'Local',
        validity: 365,
      });
      fs.writeFileSync(this.caCert, ca.cert);
      fs.writeFileSync(this.caKey, ca.key, { mode: 0o600 });
    }
  }

  async generate(name: string, { domains = [] }: { domains?: string[] } = {}) {
    await this.ensureCA();
    const { createCert } = await import('mkcert');
    const ca = {
      cert: fs.readFileSync(this.caCert, 'utf8'),
      key: fs.readFileSync(this.caKey, 'utf8'),
    };
    domains = [...new Set([...domains, 'localhost', '127.0.0.1'])].sort();
    const digest = createHash('sha256')
      .update(JSON.stringify({ domains, ca: ca.cert }))
      .digest('hex');
    const certPath = path.join(this.directory, `${name}.crt`);
    const keyPath = path.join(this.directory, `${name}.key`);
    const stamp = path.join(this.directory, `${name}.json`);
    if (
      !valid(certPath) ||
      !fs.existsSync(keyPath) ||
      !fs.existsSync(stamp) ||
      fs.readFileSync(stamp, 'utf8') !== digest
    ) {
      const pair = await createCert({ ca, domains, organization: this.identity, validity: 365 });
      fs.writeFileSync(certPath, pair.cert);
      // The private directory protects host files; mapped container users need to read the mounted service key.
      fs.writeFileSync(keyPath, pair.key, { mode: 0o644 });
      fs.writeFileSync(stamp, digest);
    }
    return { certPath, keyPath };
  }
}
