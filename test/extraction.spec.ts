import ts from 'typescript';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import inventory from '../extraction.json';
import metadata from '../package.json';

describe('extraction provenance', () => {
  it('preserves original bytes or records each adaptation and executable mode', () => {
    for (const file of inventory.files) {
      const location = path.join(import.meta.dirname, '..', file.path);
      const data = fs.readFileSync(location);
      const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      assert.equal(blob, file.adaptedBlob ?? file.blob, file.path);
      if (file.adaptedBlob) assert.ok(file.adaptation, file.path);
      assert.equal(Boolean(fs.statSync(location).mode & 0o111), file.mode === '100755', file.path);
    }
    assert.equal(fs.existsSync(path.join(import.meta.dirname, '../vendor')), false);
    assert.equal(new Set(inventory.files.map((file) => file.path)).size, inventory.files.length);
  });
  it('resolves retained ESM imports from declared dependencies', () => {
    for (const file of inventory.files.filter(
      (file) => file.path.endsWith('.ts') && !file.path.startsWith('test/'),
    )) {
      const location = path.join(import.meta.dirname, '..', file.path);
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
            node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]),
            `${file.path}: runtime import must be statically discoverable`,
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
        assert.ok(Object.hasOwn(metadata.dependencies, name), `${file.path}: ${name}`);
      }
    }
  });
});
