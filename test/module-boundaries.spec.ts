import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import metadata from '../package.json';
import * as api from '@tanaab/devtool';
import read from '../utils/read-file.ts';
import mergePromise from '../utils/merge-promise.ts';
import yaml from '../components/yaml.ts';
import { fixture } from './project-fixture.ts';

describe('ESM boundaries', () => {
  it('resolves runtime imports from declared dependencies and keeps dynamic imports discoverable', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files = new Bun.Glob('{bin,lib,components,builders,utils,packages}/**/*.ts');
    for (const file of files.scanSync(root)) {
      if (file.endsWith('.d.ts')) continue;
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
            node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]),
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
        assert.ok(Object.hasOwn(metadata.dependencies, name), `${file}: ${name}`);
      }
    }
  });
  it('should expose only the supported runtime exports', () => {
    assert.deepEqual(Object.keys(api).sort(), ['createDevtool', 'name', 'version']);
  });
  it('should read JSON afresh and bound legacy data-module loading to explicit files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-esm-'));
    try {
      const file = path.join(directory, 'data.json');
      fs.writeFileSync(file, '{"first":true}');
      assert.deepEqual(read(file), { first: true });
      fs.writeFileSync(file, '{"second":true}');
      assert.deepEqual(read(file), { second: true });
      const dataModule = path.join(directory, 'data.cjs');
      fs.writeFileSync(dataModule, 'module.exports = {legacy: true};');
      assert.deepEqual(read(dataModule), { legacy: true });
      const imported = yaml.load(`value: !import ${file}`) as {
        value: { second: boolean; getMetadata(): { file: string } };
      };
      assert.equal(imported.value.second, true);
      assert.equal(imported.value.getMetadata().file, file);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  it('should preserve deferred promise and event behavior', async () => {
    let invoked = 0;
    const emitter = new EventEmitter();
    const operation = mergePromise(emitter, async () => {
      invoked++;
      return 7;
    });
    assert.equal(invoked, 0);
    assert.equal(operation, emitter);
    let event = '';
    operation.on('progress', (value) => {
      event = value;
    });
    operation.emit('progress', 'working');
    assert.equal(event, 'working');
    assert.equal(await operation, 7);
    assert.equal(invoked, 1);
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
      const context = app.services[0].generateBuildContext();
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
