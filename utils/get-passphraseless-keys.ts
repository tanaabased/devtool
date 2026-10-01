import exists from './exists-sync.ts';
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

const hasPassphrase = (data: string) => {
  // check for Proc-Type and DEK-Info
  if (data.includes('Proc-Type') && data.includes('DEK-Info')) return true;

  // base64 decode the string and check for "none"
  if (!Buffer.from(data, 'base64').toString('utf8').includes('none')) return true;

  // otherwise i think we are good?
  return false;
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
      .filter((file) => !hasPassphrase(file.contents))
      .map((file) => file.file)
  );
};
