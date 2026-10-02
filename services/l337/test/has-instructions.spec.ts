import assert from 'node:assert/strict';
import hasInstructions from '../utils/has-instructions.ts';

describe('Dockerfile instructions', () => {
  it('matches whole instructions across casing and whitespace, ignoring comments', () => {
    assert.equal(hasInstructions('  copy\t. /app\n'), true);
    assert.equal(hasInstructions('# COPY . /app\nRUN echo ADD\nCOPYCAT /x'), false);
    assert.equal(hasInstructions('RUN true', ['RUN']), true);
    assert.equal(hasInstructions(''), false);
  });
});
