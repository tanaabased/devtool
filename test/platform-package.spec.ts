import assert from 'node:assert/strict';
import { platformPackage } from '../lib/platform-package.ts';

describe('platform binary selection', () => {
  it('should select only the supported platform and libc combinations', () => {
    assert.equal(platformPackage('darwin', 'arm64'), '@tanaab/devtool-darwin-arm64');
    assert.equal(platformPackage('linux', 'x64', true), '@tanaab/devtool-linux-x64');
    for (const [platform, arch, glibc] of [
      ['win32', 'x64', true],
      ['linux', 'arm64', true],
      ['linux', 'x64', false],
    ] as const)
      assert.throws(
        () => platformPackage(platform, arch, glibc),
        /Unsupported devtool binary platform/,
      );
  });
});
