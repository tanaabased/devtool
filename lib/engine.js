'use strict';

const DockerEngine = require('../components/docker-engine');
const execute = require('../utils/execute');

/** Existing Docker CLI/context plus the retained Core image builder. No installation or discovery. */
class Engine extends DockerEngine {
  constructor() {
    super({}, {builder: 'docker'});
  }

  getImage(tag) {
    return {inspect: async () => {
      const result = await execute('docker', ['image', 'inspect', tag]);
      return JSON.parse(result.stdout)[0];
    }};
  }

  async imageExists(tag) {
    try { await this.getImage(tag).inspect(); return true; }
    catch (error) {
      if (/No such image|No such object/i.test(error.stderr ?? '')) return false;
      throw error;
    }
  }

  compose(project, file, args, options = {}) {
    return execute('docker', ['compose', '--project-name', project, '--file', file, ...args], options);
  }
}

module.exports = Engine;
