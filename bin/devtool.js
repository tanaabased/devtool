#!/usr/bin/env node
'use strict';

require('../lib/cli').runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
