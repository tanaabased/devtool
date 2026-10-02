import exists from './exists-sync.ts';
import { createPrivateKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRIVATE_KEY_REGEX = /^-+BEGIN\s.*PRIVATE KEY-+/;

const getAllFiles = (dir: string, files: string[] = []): string[] => {
  const names = fs.readdirSync(dir);

  names.forEach((file) => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) getAllFiles(filePath, files);
    else files.push(filePath);
  });

  return files;
};

const isUnencrypted = (data: string) => {
  try {
    if (!data.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) {
      // Parsing without a passphrase rejects encrypted and malformed PEM keys.
      createPrivateKey(data);
      return true;
    }
    const envelope = data
      .trim()
      .match(
        /^-----BEGIN OPENSSH PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END OPENSSH PRIVATE KEY-----$/,
      );
    if (!envelope?.[1]) return false;
    const encoded = envelope[1].replace(/\s/g, '');
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.toString('base64') !== encoded) return false;
    const magic = Buffer.from('openssh-key-v1\0');
    if (!buffer.subarray(0, magic.length).equals(magic)) return false;
    let offset = magic.length;
    const integer = () => {
      const value = buffer.readUInt32BE(offset);
      offset += 4;
      return value;
    };
    const field = () => {
      const length = integer();
      if (length > buffer.length - offset) throw new Error('Truncated OpenSSH key');
      const value = buffer.subarray(offset, offset + length);
      offset += length;
      return value;
    };
    // OpenSSH PROTOCOL.key: unencrypted keys use cipher/KDF "none" and empty KDF options.
    if (field().toString() !== 'none' || field().toString() !== 'none' || field().length !== 0)
      return false;
    if (integer() !== 1 || field().length === 0) return false;
    const privateKey = field();
    return (
      offset === buffer.length &&
      privateKey.length > 8 &&
      privateKey.readUInt32BE(0) === privateKey.readUInt32BE(4)
    );
  } catch {
    return false;
  }
};

export default (paths: string | string[] = []) => {
  // if paths is a string then make it into an array
  if (typeof paths === 'string') paths = [paths];

  // now lets try to find all the private keys without passphrases
  return (
    paths
      // @NOTE: paths comes from user config so it can contain basically anything
      .filter((path) => exists(path))
      .map((path) => (fs.statSync(path).isDirectory() ? getAllFiles(path) : path))
      .flat()
      .map((file) => ({ file, contents: fs.readFileSync(file, 'utf8') }))
      .filter((file) => PRIVATE_KEY_REGEX.test(file.contents))
      .filter((file) => isUnencrypted(file.contents))
      .map((file) => file.file)
  );
};
