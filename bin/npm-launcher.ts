#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { platformPackage } from '../lib/platform-package.ts';
import { version } from '../package.json';

try {
  const name = platformPackage();
  let manifest: string;
  try {
    manifest = createRequire(import.meta.url).resolve(`${name}/package.json`);
  } catch {
    throw new Error(
      `Missing ${name}@${version}. Reinstall @tanaab/devtool with optional dependencies enabled.`,
    );
  }
  const binaryMetadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (binaryMetadata.name !== name || binaryMetadata.version !== version)
    throw new Error(
      `Expected ${name}@${version}; found ${binaryMetadata.name}@${binaryMetadata.version}. Reinstall matching packages.`,
    );
  const executable = path.join(path.dirname(manifest), 'bin', 'devtool');
  fs.accessSync(executable, fs.constants.X_OK);
  const child = spawn(executable, process.argv.slice(2), { stdio: 'inherit' });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  const handlers = signals.map((signal) => {
    const handler = () => {
      child.kill(signal);
    };
    process.on(signal, handler);
    return handler;
  });
  const cleanup = () =>
    signals.forEach((signal, index) => process.removeListener(signal, handlers[index]));
  child.on('error', (error) => {
    cleanup();
    process.stderr.write(`devtool: Unable to launch ${name}: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
} catch (error) {
  process.stderr.write(`devtool: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
