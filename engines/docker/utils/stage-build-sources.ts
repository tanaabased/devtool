import fs from 'node:fs';
import type { BuildSource } from '../../../components/engine.ts';
import copyBuildSource from './copy-build-source.ts';
import asError from '../../../utils/as-error.ts';
import remove from '../../../utils/remove.ts';

/** Reset a generated context and copy sources before the builder installs its Dockerfile. */
export default (context: string, sources: BuildSource[], excludePaths: string[] = []) => {
  remove(context);
  fs.mkdirSync(context, { recursive: true });
  for (const source of sources) {
    try {
      copyBuildSource(source, context, excludePaths);
    } catch (caught) {
      const error = asError(caught);
      error.message = `Failed to copy ${source.source} into build context at ${source.target}!: ${error.message}`;
      throw error;
    }
  }
};
