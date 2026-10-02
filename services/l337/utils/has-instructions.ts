// checks if an Image file has certain instructions
export default (contents = '', instructions = ['COPY', 'ADD']) => {
  const matches = contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0] ?? '')
    .map((line) => line.toUpperCase())
    .filter((line) => instructions.includes(line));
  return matches.length > 0;
};
