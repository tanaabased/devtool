import path from 'node:path';

export default (input: string) => {
  const [name = '', hint] = input.split('@');
  const file = name.trim();
  const type = hint ?? path.extname(file);
  return { file, type: type.startsWith('.') ? type.slice(1) : type };
};
