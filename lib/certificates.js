'use strict';

const {createHash, X509Certificate} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Project-owned CA and service certificates; never modifies host trust. */
module.exports = class Certificates {
  constructor(directory, identity) {
    this.directory = directory;
    this.identity = identity;
    this.caCert = path.join(directory, 'ca.crt');
    this.caKey = path.join(directory, 'ca.key');
  }

  async generate(name, {domains = []} = {}) {
    const {createCA, createCert} = require('mkcert');
    fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
    const valid = file => {
      try { return Date.parse(new X509Certificate(fs.readFileSync(file)).validTo) > Date.now() + 86400000; }
      catch { return false; }
    };
    if (!valid(this.caCert) || !fs.existsSync(this.caKey)) {
      const ca = await createCA({organization: this.identity, countryCode: 'US', state: 'Local', locality: 'Local', validity: 365});
      fs.writeFileSync(this.caCert, ca.cert);
      fs.writeFileSync(this.caKey, ca.key, {mode: 0o600});
    }
    const ca = {cert: fs.readFileSync(this.caCert, 'utf8'), key: fs.readFileSync(this.caKey, 'utf8')};
    domains = [...new Set([...domains, 'localhost', '127.0.0.1'])].sort();
    const digest = createHash('sha256').update(JSON.stringify({domains, ca: ca.cert})).digest('hex');
    const certPath = path.join(this.directory, `${name}.crt`);
    const keyPath = path.join(this.directory, `${name}.key`);
    const stamp = path.join(this.directory, `${name}.json`);
    if (!valid(certPath) || !fs.existsSync(keyPath) || !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== digest) {
      const pair = await createCert({ca, domains, organization: this.identity, validity: 365});
      fs.writeFileSync(certPath, pair.cert);
      fs.writeFileSync(keyPath, pair.key, {mode: 0o600});
      fs.writeFileSync(stamp, digest);
    }
    return {certPath, keyPath};
  }
};
