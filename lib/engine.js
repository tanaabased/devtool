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

  async listVolumes() {
    const result = await execute('docker', ['volume', 'ls', '--quiet']);
    const names = result.stdout.trim().split('\n').filter(Boolean);
    if (!names.length) return {Volumes: []};
    return {Volumes: JSON.parse((await execute('docker', ['volume', 'inspect', ...names])).stdout)};
  }

  async createVolume({Name, Labels}) {
    const existing = (await this.listVolumes()).Volumes.find(volume => volume.Name === Name);
    if (existing) {
      if (Object.entries(Labels).some(([key, value]) => existing.Labels?.[key] !== value)) throw new Error(`Storage ownership mismatch: ${Name}`);
      return existing;
    }
    await execute('docker', ['volume', 'create', ...Object.entries(Labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]), Name]);
  }

  getVolume(name) {
    return {remove: () => execute('docker', ['volume', 'rm', name])};
  }
}

module.exports = Engine;
