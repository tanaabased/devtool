import dropRight from 'lodash-es/dropRight.js';
import path from 'node:path';
import range from 'lodash-es/range.js';

/*
 * TBD
 */
export default (files: string[], startsFrom: string) => {
  return range(startsFrom.split(path.sep).length)
    .map((end) => dropRight(startsFrom.split(path.sep), end).join(path.sep))
    .map((dir) => files.map((file) => path.join(dir, path.basename(file))))
    .flat();
};
