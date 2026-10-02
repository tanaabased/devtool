import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import keys from '../utils/get-passphraseless-keys.ts';

// Minimal OpenSSH envelope markers; no real key material is needed to test selection.
const envelope = (cipher: string) =>
  `-----BEGIN OPENSSH PRIVATE KEY-----\n${Buffer.from(`openssh-key-v1\0\0\0\0\x04${cipher}`).toString('base64')}\n-----END OPENSSH PRIVATE KEY-----`;

describe('SSH key selection', () => {
  it('walks directories, skips absent paths and excludes encrypted and public inputs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-keys-'));
    try {
      const nested = path.join(root, 'nested');
      fs.mkdirSync(nested);
      const plain = path.join(nested, 'id');
      fs.writeFileSync(plain, envelope('none'));
      fs.writeFileSync(path.join(root, 'encrypted'), envelope('aes256-ctr'));
      fs.writeFileSync(path.join(root, 'id.pub'), 'ssh-ed25519 public');
      fs.writeFileSync(
        path.join(root, 'legacy'),
        '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC',
      );
      assert.deepEqual(keys([root, path.join(root, 'absent')]), [plain]);
      assert.deepEqual(keys(plain), [plain]);
      assert.deepEqual(keys(), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
