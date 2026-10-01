#!/usr/bin/env bun
import { runCli } from '../lib/cli.ts';

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
