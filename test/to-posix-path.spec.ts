import assert from 'node:assert/strict';
import posix from '../utils/to-posix-path.ts';

describe('utils/to-posix-path', () => {
  it('should translate Windows separators and drive prefixes while preserving POSIX paths', () => {
    assert.equal(posix('C:\\Users\\a b\\project'), '/C/Users/a b/project');
    assert.equal(posix('d:/project'), '/d/project');
    assert.equal(posix('folder\\file'), 'folder/file');
    assert.equal(posix('/tmp/a b'), '/tmp/a b');
    assert.equal(posix(''), '');
  });
});
