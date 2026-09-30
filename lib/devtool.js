'use strict';

const Runtime = require('./runtime');
const metadata = require('../package.json');

/** Create an inert, independently configured runtime. loadApp performs explicit I/O. */
exports.createDevtool = options => new Runtime(options);
exports.name = 'devtool';
exports.version = metadata.version;
