import requireValue from '../utils/require-value.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import metadata from '../package.json';
import * as api from '@tanaab/devtool';
import { fixture } from '../utils/create-test-project.ts';

describe('ESM boundaries', () => {
  it('resolves runtime imports from declared dependencies and keeps dynamic imports discoverable', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files = new Bun.Glob('{bin,lib,components,engines,utils,services}/**/*.ts');
    for (const file of files.scanSync(root)) {
      if (file.endsWith('.d.ts') || file.includes('/test/')) continue;
      const location = path.join(root, file);
      const source = ts.createSourceFile(
        location,
        fs.readFileSync(location, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const specifiers: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isImportDeclaration(node) &&
          !node.importClause?.isTypeOnly &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          specifiers.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          assert.ok(
            node.arguments.length === 1 && ts.isStringLiteral(requireValue(node.arguments[0])),
            `${file}: runtime import must be statically discoverable`,
          );
          specifiers.push((node.arguments[0] as ts.StringLiteral).text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      for (const specifier of specifiers) {
        Bun.resolveSync(specifier, path.dirname(location));
        if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        assert.ok(Object.hasOwn(metadata.dependencies, requireValue(name)), `${file}: ${name}`);
      }
    }
  });
  it('should expose only the supported runtime exports', () => {
    assert.deepEqual(Object.keys(api).sort(), [
      'Config',
      'configSchemas',
      'createDevtool',
      'name',
      'version',
    ]);
  });
  it('should resolve service assets independently of the caller working directory', async () => {
    const f = fixture({
      web: {
        type: 'lando',
        image: 'alpine',
        certs: false,
        packages: { git: false, sudo: false, 'ssh-agent': false },
      },
    });
    try {
      const app = f.load();
      await app.start();
      const context = requireValue(app.services[0]).generateBuildContext();
      for (const name of ['boot.sh', 'entrypoint.sh', 'exec.sh', 'add-user.sh']) {
        const source = context.sources.find((source) => path.basename(source.source) === name);
        assert.ok(source, name);
        assert.ok(fs.statSync(source.source).isFile(), name);
      }
    } finally {
      f.cleanup();
    }
  });
});
