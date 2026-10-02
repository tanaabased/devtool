import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import keys from '../utils/get-passphraseless-keys.ts';

// These disposable fixture keys have never been authorized anywhere.
const openssh = (name: string) =>
  fs.readFileSync(new URL(`../fixtures/ssh-${name}.key`, import.meta.url), 'utf8');

describe('utils/get-passphraseless-keys', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-keys-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('should walk directories and select only unencrypted OpenSSH keys', () => {
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested);
    const plain = path.join(nested, 'id');
    fs.writeFileSync(plain, openssh('unencrypted'));
    fs.writeFileSync(path.join(root, 'encrypted'), openssh('encrypted'));
    fs.writeFileSync(path.join(root, 'public'), 'ssh-ed25519 public');
    assert.deepEqual(keys([root, path.join(root, 'absent')]), [plain]);
    assert.deepEqual(keys(plain), [plain]);
    assert.deepEqual(keys(), []);
  });
  it('should accept unencrypted PKCS#1 and PKCS#8 PEM and reject encrypted variants', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    for (const type of ['pkcs1', 'pkcs8'] as const) {
      const plain = path.join(root, type);
      const encrypted = path.join(root, `${type}-encrypted`);
      fs.writeFileSync(plain, privateKey.export({ type, format: 'pem' }));
      fs.writeFileSync(
        encrypted,
        privateKey.export({ type, format: 'pem', cipher: 'aes-256-cbc', passphrase: 'fixture' }),
      );
      assert.deepEqual(keys(plain), [plain]);
      assert.deepEqual(keys(encrypted), []);
    }
  });
  it('should reject malformed envelopes and ignore incidental none text', () => {
    const wrap = (body: Buffer) =>
      `-----BEGIN OPENSSH PRIVATE KEY-----\n${body.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----`;
    const original = Buffer.from(
      openssh('unencrypted').split('\n').slice(1, -2).join(''),
      'base64',
    );
    const encrypted = Buffer.from(original);
    encrypted.write('xxxx', 19); // Change the cipher, leaving the KDF's "none" in the envelope.
    const mismatched = Buffer.from(original);
    // Locate the private block after the header, key count and public-key string.
    let offset = 15;
    for (let field = 0; field < 3; field++) offset += 4 + original.readUInt32BE(offset);
    offset += 4;
    offset += 4 + original.readUInt32BE(offset);
    mismatched[offset + 4] = (mismatched[offset + 4] ?? 0) ^ 1;
    for (const data of [
      '-----BEGIN RSA PRIVATE KEY-----\ninvalid\n-----END RSA PRIVATE KEY-----',
      wrap(Buffer.from('openssh-key-v1\0\0\0\0\x04none')),
      wrap(original.subarray(0, original.length - 5)),
      wrap(encrypted),
      wrap(mismatched),
    ]) {
      const file = path.join(root, 'malformed');
      fs.writeFileSync(file, data);
      assert.deepEqual(keys(file), []);
    }
  });
});
