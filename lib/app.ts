import DefaultEngine from '../engines/docker/docker.ts';
import type {
  AppConfig,
  AppInfo,
  PersistedState,
  ProductConfig,
  ProductSettings,
} from './types.ts';
import type { ComposeFragment, ServiceInfo } from '../components/service.ts';
import type { Engine, ExecOptions } from '../components/engine.ts';
import type LandoBuilder from '../services/lando/lando.ts';
type LandoService = InstanceType<ReturnType<typeof LandoBuilder.builder>>;
type Service = L337 | LandoService;
const isLando = (service: Service): service is LandoService => service instanceof components.lando;
import asError from '../utils/as-error.ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import clone from '../utils/clone-config.ts';
import Config from './config.ts';
import configSchemas from './config-schemas.ts';
import createProductConfig from './product-config.ts';
import resolveProductConfig from '../utils/resolve-product-config.ts';
import configInputData from '../utils/config-input-data.ts';
import normalizeServicePaths from '../services/l337/utils/normalize-service-paths.ts';
import mergeCompose from '../utils/merge-compose.ts';
import createDebug from './debug.ts';
import yaml from 'js-yaml';
import fingerprint from '../utils/build-fingerprint.ts';
import L337 from '../services/l337/l337.ts';
import lando from '../services/lando/lando.ts';
import certificates from '../services/lando/lib/certificates.ts';
import isDisabled from '../utils/is-disabled.ts';

const components = Object.freeze({ l337: L337, lando: lando.builder(L337, lando.defaults) });
const validName = (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);

class App {
  private debug: ReturnType<typeof createDebug>;
  readonly config: ProductConfig;
  readonly file?: string;
  readonly root: string;
  readonly data: AppConfig;
  readonly definition: Config<AppConfig>;
  readonly settings: Config<ProductSettings>;
  private inputData: AppConfig;
  private initializedDefinition: Config<AppConfig>;
  private prepared = false;
  project: string;
  _dir: string;
  cacheDir: string;
  stateFile: string;
  composeFile: string;
  generatedRoots: string[];
  storageNamespace: string;
  certificates: certificates;
  engine?: Engine;
  composeData: ComposeFragment[];
  info: ServiceInfo[];
  services: Service[];
  state: PersistedState;

  constructor({
    config: settings,
    definition: input,
    root,
    file,
    engine,
  }: {
    config?: ProductSettings | Config<ProductSettings>;
    definition: AppConfig | Config<AppConfig> | readonly string[];
    root: string;
    file?: string;
    engine?: Engine;
  }) {
    if (!root) throw new Error('App initialization requires an explicit root');
    this.root = fs.realpathSync(root);
    if (!fs.statSync(this.root).isDirectory()) throw new Error('App root must be a directory');
    this.definition = Array.isArray(input)
      ? new Config<AppConfig>({
          root: this.root,
          schema: configSchemas.appDefinition,
          sources: input.map((file, i) => ({ id: `app-${i}`, kind: 'file', file })),
        })
      : Config.from<AppConfig>(input as AppConfig | Config<AppConfig>, {
          schema: configSchemas.appDefinition,
          ...(input instanceof Config ? {} : { root: this.root }),
        });
    const data = this.definition.compile().values as AppConfig;
    this.inputData = configInputData(this.definition);
    this.initializedDefinition = this.definition.fork();
    this.initializedDefinition.compile();
    this.settings =
      settings instanceof Config
        ? Config.from(settings, { schema: configSchemas.runtime })
        : createProductConfig(settings ?? {}, { root: this.root });
    const before = this.settings.sources.find(
      ({ role }) => role === 'environment' || role === 'caller',
    )?.id;
    this.settings.overlay(this.definition, { select: ['config'], before });
    const config = resolveProductConfig(this.settings);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      !data.services ||
      typeof data.services !== 'object' ||
      Array.isArray(data.services)
    ) {
      throw new Error('App configuration requires a services object');
    }
    if (!Object.keys(data.services).length)
      throw new Error('App configuration requires at least one service');
    for (const [id, service] of Object.entries(data.services)) {
      if (!validName(id)) throw new Error(`Invalid service name: ${id}`);
      if (
        !service ||
        !Object.hasOwn(components, service.type ?? '') ||
        (service.api !== undefined && service.api !== 4)
      ) {
        throw new Error(`Unsupported service type for ${id}: ${service?.type ?? '(missing)'}`);
      }
      if (!service.image && !service.build)
        throw new Error(`Service ${id} requires image or build`);
      // These Compose escape hatches bypass the selected project's ownership boundary.
      if (
        service.container_name ||
        service.network_mode ||
        service.external_links ||
        service.volumes_from
      ) {
        throw new Error(`Service ${id} uses unsupported global container/network references`);
      }
      for (const key of ['container_name', 'network_mode', 'external_links', 'volumes_from']) {
        if (service.overrides?.[key])
          throw new Error(`Service ${id} uses unsupported overrides.${key}`);
      }
      if (service.packages?.proxy) throw new Error('Proxy packages are not supported');
    }
    for (const kind of ['networks', 'volumes'] as const) {
      for (const [id, resource] of Object.entries(data[kind] ?? {})) {
        if (!validName(id)) throw new Error(`Invalid ${kind} name: ${id}`);
        if (resource?.name && !resource.external)
          throw new Error(`${kind}.${id}: explicit names require external: true`);
      }
    }
    this.debug = createDebug(`devtool:${config.identity}:app`);
    this.config = Config.from<ProductConfig>(config).compile().values as ProductConfig;
    this.file = file === undefined ? undefined : path.resolve(this.root, file);
    this.data = data;
    const identity = createHash('sha256')
      .update(`${config.identity}\0${this.root}`)
      .digest('hex')
      .slice(0, 12);
    const name =
      String(data.name ?? path.basename(this.root))
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 32) || 'app';
    this.project = `${config.identity.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${name}-${identity}`;
    this._dir = path.join(config.dataRoot, 'projects', this.project);
    this.cacheDir = path.join(config.cacheRoot, 'projects', this.project);
    this.stateFile = path.join(this.cacheDir, 'state.json');
    this.composeFile = path.join(this._dir, 'compose.yml');
    this.generatedRoots = [
      path.join(config.dataRoot, 'projects'),
      path.join(config.cacheRoot, 'projects'),
    ];
    this.storageNamespace = `${config.identity.toLowerCase()}-${createHash('sha256').update(config.dataRoot).digest('hex').slice(0, 12)}`;
    this.certificates = new certificates(path.join(this._dir, 'certs'), config.identity);
    this.engine = engine;
    this.composeData = [];
    this.info = [];
    this.services = [];
    this.state = { services: {} };
  }

  /** Declarative metadata only; no saved-state reads, service constructors or engine contact. */
  getMetadata() {
    return { project: this.project, root: this.root, file: this.file, definition: this.data };
  }

  /** Materialize the initialized snapshot once. Later Config edits require a new App. */
  prepare(): this {
    if (this.prepared) return this;
    if (this.config.cache && fs.existsSync(this.stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (state.project === this.project && state.services && typeof state.services === 'object')
          this.state = state;
      } catch (caught) {
        const error = asError(caught);
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    try {
      this.construct();
      this.prepared = true;
      return this;
    } catch (error) {
      this.services = [];
      this.info = [];
      this.composeData = [];
      throw error;
    }
  }

  getEngine(): Engine {
    this.engine ??= new DefaultEngine();
    return this.engine;
  }

  private construct() {
    this.composeData = [];
    this.info = [];
    this.services = [];
    this.add({
      data: [
        { networks: clone(this.data.networks ?? {}), volumes: clone(this.data.volumes ?? {}) },
      ],
    });
    for (const [id, specification] of Object.entries(this.inputData.services)) {
      const { api, type, primary, ...config } = normalizeServicePaths(
        specification,
        (keys) => {
          const origin = this.initializedDefinition.explain(['services', id, ...keys]).winner;
          const file = origin?.importedFrom ?? origin?.file;
          return file
            ? path.dirname(file)
            : (this.initializedDefinition.sources.find((source) => source.id === origin?.source)
                ?.base ?? this.root);
        },
        Object.keys(this.data.volumes ?? {}),
      );
      const saved = this.state.services[id];
      const service = new components[type as keyof typeof components](
        id,
        {
          appRoot: this.root,
          project: this.project,
          config,
          type,
          primary,
          context: path.join(this._dir, 'build-contexts', id),
          tmpdir: path.join(this._dir, 'tmp', id),
          tag: `${this.project}-${id}:latest`,
          tlvolumes: this.data.volumes ?? {},
          states: saved ? { IMAGE: 'BUILT' } : {},
          info: saved
            ? {
                tag: saved.tag,
                ...(type === 'lando'
                  ? {
                      state: { APP: saved.appBuilt ? 'BUILT' : 'UNBUILT' },
                      healthy: saved.healthy ?? 'unknown',
                    }
                  : {}),
              }
            : {},
          engine: {
            buildx: async (file, context) =>
              this.getEngine().buildx(file, {
                ...context,
                excludePaths: this.generatedRoots,
              }),
            build: async (file, context) =>
              this.getEngine().build(file, {
                ...context,
                excludePaths: this.generatedRoots,
              }),
            getImage: (tag) => ({
              inspect: async () => this.getEngine().getImage(tag).inspect(),
            }),
            listVolumes: async () => this.getEngine().listVolumes(),
            createVolume: async (options) => this.getEngine().createVolume(options),
            getVolume: (id) => ({
              remove: async (options) => this.getEngine().getVolume(id).remove(options),
            }),
            run: async (command, options) => {
              this.assemble();
              return this.getEngine().compose(this.project, this.composeFile, [
                'run',
                '--rm',
                '--no-deps',
                '-T',
                '--user',
                options.createOptions.User,
                '--entrypoint',
                options.createOptions.Entrypoint.join(' '),
                id,
                ...command,
              ]);
            },
          },
        },
        this,
        {
          config: {
            ...this.config,
            userConfRoot: this.config.dataRoot,
            uid: this.config.uid ?? process.getuid?.() ?? 1000,
            gid: this.config.gid ?? process.getgid?.() ?? 1000,
            username: this.config.username ?? 'devtool',
            caCert: this.certificates.caCert,
            networkBridge: 'app',
            storageNamespace: this.storageNamespace,
          },
          generateCert: (name, options) => this.certificates.generate(name, options),
        },
      );
      this.services.push(service);
      this.info.push(service.info);
    }
  }

  add(fragment: ComposeFragment) {
    this.composeData.push(fragment);
  }

  private imageTag(id: string) {
    const config = this.data.services[id];
    if (!config) throw new Error(`Unknown service: ${id}`);
    const { image, build } = config;
    const custom =
      build && typeof image === 'string'
        ? image
        : image && typeof image === 'object' && 'tag' in image
          ? image.tag
          : undefined;
    return custom || `${this.project}-${id}:latest`;
  }

  assemble() {
    this.prepare();
    const compose = mergeCompose(this.composeData);
    // L337 owns image builds; Compose must never rebuild the original Dockerfile.
    for (const [id, service] of Object.entries(compose.services ?? {})) {
      delete service.build;
      // Lifecycle commands must also work before startup or after cache removal.
      service.image = this.imageTag(id);
    }
    fs.mkdirSync(this._dir, { recursive: true });
    fs.writeFileSync(this.composeFile, yaml.dump(compose, { noRefs: true }));
    this.debug(
      'assembled project %s with %d services',
      this.project,
      Object.keys(compose.services ?? {}).length,
    );
    return compose;
  }

  persist() {
    if (!this.config.cache) return;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const temporary = `${this.stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...this.state, project: this.project }, null, 2));
    fs.renameSync(temporary, this.stateFile);
  }

  async start({ rebuild = false } = {}) {
    this.prepare();
    this.debug('starting project %s; rebuild=%s', this.project, rebuild);
    const previous = this.state.services;
    this.state = { services: {}, running: false };
    this.persist();
    try {
      if (this.services.some((service) => isLando(service) && !isDisabled(service.certs)))
        await this.certificates.ensureCA();
      for (const service of this.services) {
        const tag = this.imageTag(service.id);
        service.tag = tag;
        if (isLando(service)) await service.prepare();
        const hash = fingerprint(service, this.generatedRoots);
        const saved = previous[service.id];
        const reusable =
          !rebuild && saved?.fingerprint === hash && (await this.getEngine().imageExists(tag));
        this.debug('service %s image cache %s', service.id, reusable ? 'hit' : 'miss');
        if (!reusable) {
          service.info = { state: { IMAGE: 'UNBUILT' } };
          await service.buildImage();
        } else {
          service.info = { state: { IMAGE: 'BUILT' }, tag: service.tag };
          if (isLando(service)) await service.buildImage();
          else service.addComposeData({ services: { [service.id]: { image: service.tag } } });
        }
        delete service.info.error;
        this.state.services[service.id] = {
          fingerprint: hash,
          tag,
          imageReused: reusable,
        };
      }
      for (const service of this.services) {
        const saved = previous[service.id];
        const record = this.state.services[service.id];
        if (!record) throw new Error(`Missing build record: ${service.id}`);
        const appHash = this.appFingerprint(service);
        if (isLando(service)) {
          service.info = { state: { APP: 'UNBUILT' } };
          const storage = await this.getEngine().listVolumes();
          const present = service.storage
            .filter((volume) => volume.type === 'volume')
            .every((volume) => storage.Volumes?.some((item) => item.Name === volume.source));
          if (
            !record.imageReused ||
            !present ||
            saved?.appFingerprint !== appHash ||
            !saved?.appBuilt
          )
            await service.buildApp();
          else service.info = { state: { APP: 'BUILT' } };
        }
        delete record.imageReused;
        Object.assign(record, {
          appFingerprint: appHash,
          appBuilt: service.info.state.APP === 'BUILT',
        });
      }
      this.assemble();
      await (
        await this.getEngine()
      ).compose(this.project, this.composeFile, ['up', '--detach', '--no-build']);
      this.state.running = true;
      await this.healthchecks();
      this.persist();
      return this.getInfo();
    } catch (caught) {
      const error = asError(caught);
      this.state = { services: {}, running: false };
      this.persist();
      throw error;
    }
  }

  appFingerprint(service: Service) {
    const hash = createHash('sha256').update(
      JSON.stringify(service.sourceConfig ?? service.config),
    );
    for (const file of isLando(service) ? service.appHooks : []) hash.update(fs.readFileSync(file));
    return hash.digest('hex');
  }

  async healthchecks() {
    for (const service of this.services.filter(isLando)) {
      const check = service.healthcheck;
      service.info = { healthy: 'unknown' };
      if (isDisabled(check)) continue;
      const options =
        typeof check === 'string' || Array.isArray(check) ? { command: check } : check;
      if (!options || typeof options !== 'object') continue;
      const command = options.command ?? options.cmd;
      const args = Array.isArray(command)
        ? command
        : ['/etc/lando/exec-multiliner.sh', Buffer.from(String(command)).toString('base64')];
      const retry = options.retry ?? 25;
      if (!Number.isInteger(retry) || retry < 1 || !command)
        throw new Error(`Invalid healthcheck for ${service.id}`);
      for (let attempt = 0; attempt < retry; attempt++) {
        try {
          await (
            await this.getEngine()
          ).compose(this.project, this.composeFile, [
            'exec',
            '-T',
            '--user',
            options.user ?? 'root',
            service.id,
            ...args,
          ]);
          service.info = { healthy: true };
          break;
        } catch {
          service.info = { healthy: false };
          if (attempt + 1 < retry)
            await new Promise((resolve) => setTimeout(resolve, options.delay ?? 1000));
        }
      }
      const record = this.state.services[service.id];
      if (!record) throw new Error(`Missing build record: ${service.id}`);
      record.healthy = service.info.healthy;
    }
  }

  async stop() {
    this.debug('stopping project %s', this.project);
    this.assemble();
    await this.getEngine().compose(this.project, this.composeFile, ['stop']);
    this.state.running = false;
    this.persist();
  }

  async restart() {
    await this.stop();
    return this.start();
  }
  async rebuild() {
    return this.start({ rebuild: true });
  }

  getInfo(): AppInfo {
    this.prepare();
    return {
      project: this.project,
      root: this.root,
      running: Boolean(this.state.running),
      services: this.info,
    };
  }

  async exec(service: string, args: string[], options: ExecOptions = {}) {
    if (!Object.hasOwn(this.data.services, service)) throw new Error(`Unknown service: ${service}`);
    if (!args.length) throw new Error('exec requires a command after --');
    this.prepare();
    const selected = this.services.find((item) => item.id === service)!;
    this.assemble();
    if (selected.type === 'lando') args = ['/etc/lando/exec.sh', ...args];
    const workdir: string[] = [];
    if (typeof selected.appMount === 'string' && !selected.config.working_dir) {
      const relative = path.relative(this.root, fs.realpathSync(options.cwd ?? process.cwd()));
      const inside =
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      workdir.push(
        '--workdir',
        path.posix.join(selected.appMount, inside ? relative.split(path.sep).join('/') : ''),
      );
    }
    return this.getEngine().compose(
      this.project,
      this.composeFile,
      ['exec', ...(options.interactive ? [] : ['-T']), ...workdir, service, ...args],
      options,
    );
  }

  async destroy() {
    this.assemble();
    await (
      await this.getEngine()
    ).compose(this.project, this.composeFile, ['down', '--volumes', '--remove-orphans']);
    for (const service of this.services) await service.destroy();
    // Both directories are derived from this product and canonical project root.
    fs.rmSync(this._dir, { recursive: true, force: true });
    if (this.config.cache) fs.rmSync(this.cacheDir, { recursive: true, force: true });
    this.state = { services: {}, running: false };
    this.prepared = false;
    this.services = [];
    this.info = [];
    this.composeData = [];
  }
}

export default App;
