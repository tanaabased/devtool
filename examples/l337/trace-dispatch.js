'use strict';
// CI-only preload: observe the actual CLI's first Docker dispatch.
const childProcess = require('node:child_process');
const fs = require('node:fs');
const spawn = childProcess.spawn;
childProcess.spawn = (command, args, ...options) => {
  if (command === 'docker') {
    fs.writeFileSync(process.env.DEVTOOL_DISPATCH_TRACE, process.hrtime.bigint().toString());
    childProcess.spawn = spawn;
  }
  return spawn(command, args, ...options);
};
