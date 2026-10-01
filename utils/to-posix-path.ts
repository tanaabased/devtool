export default (path: string) => {
  return path.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '/$1');
};
