'use strict';

const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const mergeWith = require('lodash/mergeWith');
const yaml = require('js-yaml');

const fingerprint = require('../utils/build-fingerprint');
const L337 = require('../components/l337-v4');
const lando = require('../builders/lando-v4');

const components = Object.freeze({l337: L337, lando: lando.builder(L337, lando.defaults)});
const clone = value => {
  if (value?.getMetadata) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
};
const validName = name => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);

class App {
  constructor({config, data, file, engine}) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !data.services || typeof data.services !== 'object' || Array.isArray(data.services)) {
      throw new Error('App configuration requires a services object');
    }
    if (!Object.keys(data.services).length) throw new Error('App configuration requires at least one service');
    for (const [id, service] of Object.entries(data.services)) {
      if (!validName(id)) throw new Error(`Invalid service name: ${id}`);
      if (!service || !Object.hasOwn(components, service.type) || (service.api !== undefined && service.api !== 4)) {
        throw new Error(`Unsupported service type for ${id}: ${service?.type ?? '(missing)'}`);
      }
      if (!service.image && !service.build) throw new Error(`Service ${id} requires image or build`);
      // These Compose escape hatches bypass the selected project's ownership boundary.
      if (service.container_name || service.network_mode || service.external_links || service.volumes_from) {
        throw new Error(`Service ${id} uses unsupported global container/network references`);
      }
      for (const key of ['container_name', 'network_mode', 'external_links', 'volumes_from']) {
        if (service.overrides?.[key]) throw new Error(`Service ${id} uses unsupported overrides.${key}`);
      }
      if (service.packages?.proxy) throw new Error('Proxy packages are not supported');
    }
    for (const kind of ['networks', 'volumes']) {
      for (const [id, resource] of Object.entries(data[kind] ?? {})) {
        if (!validName(id)) throw new Error(`Invalid ${kind} name: ${id}`);
        if (resource?.name && !resource.external) throw new Error(`${kind}.${id}: explicit names require external: true`);
      }
    }
    this.config = config;
    this.file = fs.realpathSync(file);
    this.root = path.dirname(this.file);
    this.data = data;
    const identity = createHash('sha256').update(`${config.identity}\0${this.root}`).digest('hex').slice(0, 12);
    const name = String(data.name ?? path.basename(this.root)).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32) || 'app';
    this.project = `${config.identity.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${name}-${identity}`;
    this._dir = path.join(config.dataRoot, 'projects', this.project);
    this.cacheDir = path.join(config.cacheRoot, 'projects', this.project);
    this.stateFile = path.join(this.cacheDir, 'state.json');
    this.composeFile = path.join(this._dir, 'compose.yml');
    this.generatedRoots = [path.join(config.dataRoot, 'projects'), path.join(config.cacheRoot, 'projects')];
    this.storageNamespace = `${config.identity.toLowerCase()}-${createHash('sha256').update(config.dataRoot).digest('hex').slice(0, 12)}`;
    this.certificates = new (require('./certificates'))(path.join(this._dir, 'certs'), config.identity);
    this.engine = engine;
    this.composeData = [];
    this.info = [];
    this.services = [];
    this.state = {services: {}};
    if (config.cache && fs.existsSync(this.stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (state.project === this.project && state.services && typeof state.services === 'object') this.state = state;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    this.construct();
  }

  getEngine() {
    this.engine ??= new (require('./engine'))();
    return this.engine;
  }

  construct() {
    this.composeData = [];
    this.info = [];
    this.services = [];
    this.add({data: [{networks: clone(this.data.networks ?? {}), volumes: clone(this.data.volumes ?? {})}]});
    for (const [id, specification] of Object.entries(this.data.services)) {
      const {api, type, primary, ...config} = clone(specification);
      const saved = this.state.services[id];
      const service = new components[type](id, {
        appRoot: this.root, project: this.project, config, type, primary,
        context: path.join(this._dir, 'build-contexts', id),
        tmpdir: path.join(this._dir, 'tmp', id),
        tag: `${this.project}-${id}:latest`,
        tlvolumes: this.data.volumes ?? {},
        states: saved ? {IMAGE: 'BUILT'} : {},
        info: saved ? {tag: saved.tag, state: {APP: saved.appBuilt ? 'BUILT' : 'UNBUILT'}, healthy: saved.healthy ?? 'unknown'} : {},
        engine: {
          buildx: (file, context) => this.getEngine().buildx(file, {...context, excludePaths: this.generatedRoots}),
          build: (file, context) => this.getEngine().build(file, {...context, excludePaths: this.generatedRoots}),
          getImage: (...args) => this.getEngine().getImage(...args),
          listVolumes: () => this.getEngine().listVolumes(),
          createVolume: options => this.getEngine().createVolume(options),
          getVolume: id => this.getEngine().getVolume(id),
          run: (command, options) => {
            this.assemble();
            return this.getEngine().compose(this.project, this.composeFile,
              ['run', '--rm', '--no-deps', '-T', '--user', options.createOptions.User,
                '--entrypoint', options.createOptions.Entrypoint.join(' '), id, ...command]);
          },
        },
      }, this, {
        config: {
          ...this.config, userConfRoot: this.config.dataRoot,
          uid: this.config.uid ?? process.getuid?.() ?? 1000,
          gid: this.config.gid ?? process.getgid?.() ?? 1000,
          username: this.config.username ?? 'devtool',
          caCert: this.certificates.caCert, networkBridge: 'app',
          storageNamespace: this.storageNamespace,
        },
        generateCert: (name, options) => this.certificates.generate(name, options),
      });
      this.services.push(service);
      this.info.push(service.info);
    }
  }

  add(fragment) { this.composeData.push(fragment); }

  assemble() {
    const compose = {};
    for (const fragment of this.composeData) {
      for (const data of fragment.data) mergeWith(compose, data, (left, right, key) => {
        if (!Array.isArray(right)) return undefined;
        // API 4 packages contribute mounts independently; a later mount replaces only the same target.
        if (key === 'volumes' && Array.isArray(left)) return [...new Map([...left, ...right].map(mount => [mount.target, mount])).values()];
        return right;
      });
    }
    // L337 owns image builds; Compose must never rebuild the original Dockerfile.
    for (const [id, service] of Object.entries(compose.services)) {
      delete service.build;
      // Lifecycle commands must also work before startup or after cache removal.
      service.image = `${this.project}-${id}:latest`;
    }
    fs.mkdirSync(this._dir, {recursive: true});
    fs.writeFileSync(this.composeFile, yaml.dump(compose, {noRefs: true}));
    return compose;
  }

  persist() {
    if (!this.config.cache) return;
    fs.mkdirSync(this.cacheDir, {recursive: true});
    const temporary = `${this.stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({...this.state, project: this.project}, null, 2));
    fs.renameSync(temporary, this.stateFile);
  }

  async start({rebuild = false} = {}) {
    const previous = this.state.services;
    this.state = {services: {}, running: false};
    this.persist();
    try {
      if (this.services.some(service => service.type === 'lando' && !require('../utils/is-disabled')(service.certs))) await this.certificates.ensureCA();
      for (const service of this.services) {
        service.tag = `${this.project}-${service.id}:latest`;
        await service.prepare?.();
        const hash = fingerprint(service, this.generatedRoots);
        const saved = previous[service.id];
        const reusable = !rebuild && saved?.fingerprint === hash && await this.getEngine().imageExists(service.tag);
        if (!reusable) {
          service.info = {state: {IMAGE: 'UNBUILT'}};
          await service.buildImage();
        } else {
          service.info = {state: {IMAGE: 'BUILT'}, tag: service.tag};
          if (service.type === 'lando') await service.buildImage();
          else service.addComposeData({services: {[service.id]: {image: service.tag}}});
        }
        delete service.info.error;
        this.state.services[service.id] = {fingerprint: hash, tag: service.tag, imageReused: reusable};
      }
      for (const service of this.services) {
        const saved = previous[service.id];
        const record = this.state.services[service.id];
        const appHash = this.appFingerprint(service);
        if (service.buildApp) {
          service.info = {state: {APP: 'UNBUILT'}};
          const storage = await this.getEngine().listVolumes();
          const present = service.storage.filter(volume => volume.type === 'volume').every(volume => storage.Volumes?.some(item => item.Name === volume.source));
          if (!record.imageReused || !present || saved?.appFingerprint !== appHash || !saved?.appBuilt) await service.buildApp();
          else service.info = {state: {APP: 'BUILT'}};
        }
        delete record.imageReused;
        Object.assign(record, {appFingerprint: appHash, appBuilt: service.info.state.APP === 'BUILT'});
      }
      this.assemble();
      await this.getEngine().compose(this.project, this.composeFile, ['up', '--detach', '--no-build']);
      this.state.running = true;
      await this.healthchecks();
      this.persist();
      return this.getInfo();
    } catch (error) {
      this.state = {services: {}, running: false};
      this.persist();
      throw error;
    }
  }

  appFingerprint(service) {
    const hash = createHash('sha256').update(JSON.stringify(service.sourceConfig ?? service.config));
    for (const file of service.appHooks ?? []) hash.update(fs.readFileSync(file));
    return hash.digest('hex');
  }

  async healthchecks() {
    for (const service of this.services.filter(service => service.type === 'lando')) {
      const check = service.healthcheck;
      service.info = {healthy: 'unknown'};
      if (require('../utils/is-disabled')(check)) continue;
      const options = require('../utils/is-stringy')(check) || Array.isArray(check) ? {command: check} : check;
      const command = options.command ?? options.cmd;
      const args = Array.isArray(command) ? command : ['/etc/lando/exec-multiliner.sh', Buffer.from(String(command)).toString('base64')];
      const retry = options.retry ?? 25;
      if (!Number.isInteger(retry) || retry < 1 || !command) throw new Error(`Invalid healthcheck for ${service.id}`);
      for (let attempt = 0; attempt < retry; attempt++) {
        try {
          await this.getEngine().compose(this.project, this.composeFile, ['exec', '-T', '--user', options.user ?? 'root', service.id, ...args]);
          service.info = {healthy: true};
          break;
        } catch (error) {
          service.info = {healthy: false};
          if (attempt + 1 < retry) await new Promise(resolve => setTimeout(resolve, options.delay ?? 1000));
        }
      }
      this.state.services[service.id].healthy = service.info.healthy;
    }
  }

  async stop() {
    this.assemble();
    await this.getEngine().compose(this.project, this.composeFile, ['stop']);
    this.state.running = false;
    this.persist();
  }

  async restart() { await this.stop(); return this.start(); }
  async rebuild() { return this.start({rebuild: true}); }

  getInfo() {
    return {project: this.project, root: this.root, running: Boolean(this.state.running), services: this.info};
  }

  async exec(service, args, options = {}) {
    if (!this.services.some(item => item.id === service)) throw new Error(`Unknown service: ${service}`);
    if (!args.length) throw new Error('exec requires a command after --');
    this.assemble();
    if (this.services.find(item => item.id === service).type === 'lando') args = ['/etc/lando/exec.sh', ...args];
    return this.getEngine().compose(this.project, this.composeFile,
      ['exec', ...(options.interactive ? [] : ['-T']), service, ...args], options);
  }

  async destroy() {
    this.assemble();
    await this.getEngine().compose(this.project, this.composeFile, ['down', '--volumes', '--remove-orphans']);
    for (const service of this.services) await service.destroy();
    // Both directories are derived from this product and canonical project root.
    fs.rmSync(this._dir, {recursive: true, force: true});
    if (this.config.cache) fs.rmSync(this.cacheDir, {recursive: true, force: true});
    this.state = {services: {}, running: false};
  }
}

module.exports = App;
