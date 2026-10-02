import type { Debugger } from 'debug';
import type {
  BuildArgs,
  BuildConfig,
  BuildGroup,
  ImageConfig,
  Mount,
  MountInput,
  NormalizedStep,
  ServiceApp,
  ServiceConfig,
  ServiceHost,
  ServiceInfo,
  ServiceInfoUpdate,
  ServiceOptions,
  Step,
  StringInput,
} from '../../../components/service.ts';
import type {
  ImageInfo,
  BuildContext,
  BuildSource,
  ServiceEngine,
} from '../../../components/engine.ts';
import type { ComposeData } from '../../../lib/types.ts';
import { ImportString } from '../../../lib/yaml.ts';
export interface ServiceData {
  groups: Record<string, BuildGroup & { weight: number; user: string; stage: string }>;
  image?: string;
  imageInstructions?: string;
  imageFileContext?: string;
  info: ServiceInfo;
  sources: (BuildSource | BuildSource[])[];
  stages: Record<string, string>;
  states: ServiceInfo['state'];
  steps: NormalizedStep[];
  volumes: string[];
}
import asError from '../../../utils/as-error.ts';
import fs from 'node:fs';
import groupBy from 'lodash-es/groupBy.js';
import isObject from 'lodash-es/isPlainObject.js';
import isStringy from '../../../utils/is-stringy.ts';
import os from 'node:os';
import merge from 'lodash-es/merge.js';
import path from 'node:path';
import remove from '../../../utils/remove.ts';
import write from '../../../utils/write-file.ts';
import uniq from 'lodash-es/uniq.js';
import { generateDockerFileFromArray } from 'dockerfile-generator/lib/dockerGenerator.js';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import getMountMatches from '../utils/get-mount-matches.ts';
import hasInstructions from '../utils/has-instructions.ts';
import toPosixPath from '../../../utils/to-posix-path.ts';
import debug from '../../../lib/debug.ts';
import parsePorts from '../utils/parse-ports.ts';
import isDisabled from '../../../utils/is-disabled.ts';
import getPassphraselessKeys from '../../../utils/get-passphraseless-keys.ts';

// Listener limits belong to each service, never the consuming process.

// @TODO: should these be methods as well? static or otherwise?

class L337Service extends EventEmitter {
  #app: ServiceApp;
  #data: ServiceData;
  #lando: ServiceHost;
  #buildEngine?: ServiceEngine;
  id: string;
  api: string | number;
  appRoot: string;
  buildkit: boolean;
  config: ServiceConfig;
  sourceConfig?: ServiceConfig;
  context: string;
  debug: Debugger;
  name: string;
  primary: boolean;
  project: string;
  sshKeys: string[];
  sshSocket: string | false | undefined;
  tag: string | undefined;
  tmpdir: string;
  type: string;
  imagefile: string;
  appMount?: MountInput | false | 0 | null;
  buildArgs: Record<string, string> = {};

  static debug: Debugger = debug('devtool:service:l337');
  static bengineConfig = {};
  static builder = undefined;
  static orchestrator = undefined;

  static async getBengine(
    config = L337Service.bengineConfig,
    {
      builder = L337Service.builder,
      debug = L337Service.debug,
      orchestrator = L337Service.orchestrator,
    } = {},
  ) {
    const { default: DockerEngine } = await import('../../../engines/docker/lib/builder.ts');
    return new DockerEngine(config, { builder, debug, orchestrator });
  }

  #init(): ServiceData {
    return {
      groups: {
        context: {
          description: 'A group for adding and copying sources to the image',
          stage: 'image',
          weight: 0,
          user: 'root',
        },
        default: {
          description:
            'A default general purpose build group around which other groups can be added',
          stage: 'image',
          weight: 1000,
          user: 'root',
        },
      },
      image: undefined,
      imageInstructions: undefined,
      imageFileContext: undefined,
      info: {
        api: 4,
        state: {
          IMAGE: 'UNBUILT',
        },
      },
      sources: [],
      stages: {
        image: 'Instructions to help generate an image',
      },
      states: {
        IMAGE: 'UNBUILT',
      },
      steps: [],
      volumes: [],
    };
  }

  set info(data: ServiceInfoUpdate | undefined) {
    // reset state info
    if (data === undefined) data = { state: this.#data.states, tag: undefined };
    // merge
    this.#data.info = merge(this.#data.info, data);
    // if we have app.info then merge into that
    if (this.#app.info.find((service) => service.service === this.id)) {
      merge(this.#app.info.find((service) => service.service === this.id) ?? {}, data);
    }
    this.emit('state', this.#data.info);
    // App lifecycle owns persistence after successful work.
  }

  get info(): ServiceInfo {
    return this.#data.info;
  }

  get _data() {
    return this.#data;
  }

  constructor(id: string, options: ServiceOptions = {}, app: ServiceApp, lando: ServiceHost) {
    super();
    const {
      project = app.project,
      appRoot = path.join(os.tmpdir(), project, 'app', id),
      // buildArgs = {},
      context = path.join(os.tmpdir(), project, 'build-contexts', id),
      config = {},
      engine,
      debug = L337Service.debug,
      groups = {},
      info = {},
      name = id,
      primary = false,
      sshKeys = [],
      sshSocket = false,
      stages = {},
      states = {},
      tag = nanoid(),
      tlvolumes = {},
      tmpdir = path.join(os.tmpdir(), project, 'tmp', id),
      type = 'l337',
      user = undefined,
    } = options;
    this.setMaxListeners(64);
    this.#buildEngine = engine;

    // set top level required stuff
    this.id = id;
    this.api = 'l337';
    this.appRoot = appRoot;
    this.buildkit = true;
    this.config = config;
    this.context = context;
    this.debug = debug.extend(id);
    this.name = name ?? id;
    this.primary = primary;
    this.project = project;
    this.sshKeys = sshKeys;
    this.sshSocket = sshSocket;
    this.tag = tag;
    this.tmpdir = tmpdir;
    this.type = type;

    this.imagefile = path.join(tmpdir, 'Imagefile');
    // @TODO: add needed validation for above things?
    // @TODO: error handling on props?

    // makre sure the build context dir exists
    fs.mkdirSync(this.context, { recursive: true });
    fs.mkdirSync(this.tmpdir, { recursive: true });

    // initialize our private data
    this.#app = app;
    this.#lando = lando;
    this.#data = merge(
      this.#init(),
      { groups },
      { stages },
      { states },
      { volumes: Object.keys(tlvolumes) },
      { groups: this.#init().groups },
    );

    // rework info based on whatever is passed in
    this.info = merge({}, { state: states }, { primary, service: id, type }, info);

    // do some special undocumented things to "ports"
    const { ports, http, https } = parsePorts(config.ports);

    // add in the l337 spec config
    this.addServiceData({
      ...config,
      extra_hosts: ['host.lando.internal:host-gateway'],
      ports,
    });
    this.addServiceData({ ports });

    // Preserve API 4 HTTP port metadata.
    this.addComposeData({
      services: {
        [this.id]: {
          labels: {
            'dev.lando.http-ports': http.join(','),
            'dev.lando.https-ports': https.join(','),
          },
        },
      },
    });

    // set user into info
    this.info = { user: user ?? config.user ?? 'root' };

    // if we do not have an appmount yet and we have volumes information then try to infer it
    if (this.config && this.config.volumes && this.config.volumes.length > 0) {
      // try to get some possible app mounts
      const appMounts = getMountMatches(this.appRoot, this.config.volumes);
      // if we have one then set it
      if (appMounts.length > 0) {
        this.appMount = appMounts.pop();
        this.info = { appMount: this.appMount };
      }
      // debug
      this.debug('%o autoset appmount to %o, did not select %o', this.id, this.appMount, appMounts);
    }
    if (this.info?.state?.IMAGE === 'BUILT' && this.tag) {
      this.addComposeData({ services: { [this.id]: { image: this.tag } } });
    }
  }

  // passed in build args that can be used
  addBuildArgs(input: BuildArgs) {
    let args = input;
    // if args is an object lets make it into an array
    if (isObject(args)) args = Object.entries(args);

    // if args is a string then just arrayify it immediately
    if (typeof args === 'string') args = [args];

    // if we arent an array at this point something has gone amis so lets just set unset it and debug
    if (!Array.isArray(args)) {
      args = [];
      this.debug('build-args cannot be translated into an array so resetting to empty');
    }

    const entries = args
      .filter((arg) => typeof arg !== 'string' || arg.includes('='))
      .map((arg) =>
        typeof arg === 'string'
          ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
          : arg,
      )
      .filter(
        (arg): arg is [string, unknown] =>
          Array.isArray(arg) && arg[0] != null && String(arg[0]).trim() !== '' && arg[1] != null,
      )
      .map(([key, value]) => [key.trim(), String(value).trim()]);

    // merge into build args
    this.buildArgs = merge({}, this.buildArgs, Object.fromEntries(entries));
    this.debug('%o build-args are now %o', this.id, this.buildArgs);
  }

  // this handles our "changes" to docker-composes "build" key but really it just processes it and passes it through
  addBuildData(data: string | BuildConfig) {
    // if data is a string then its the context and it should be
    if (typeof data === 'string') data = { context: data };
    // if no context then set to app root
    data.context = path.resolve(this.appRoot, data.context ?? '.');
    // ensure dockerfile is set
    if (!data.dockerfile) data.dockerfile = 'Dockerfile';
    // now pass the imagefile stuff into image parsing
    this.setBaseImage(path.join(data.context, data.dockerfile), data);
    if (data.args) this.addBuildArgs(data.args);
    // make sure we are adding the dockerfile context directly as a source so COPY/ADD instructions work
    // @NOTE: we are not adding a "context" because that also injects dockerfile instructions which we might already have
    this.#data.sources.push({ source: data.context, target: '.' });
  }

  // just pushes the compose data directly into our thing
  addComposeData(data: ComposeData = {}) {
    // if we have a top level volume being added lets add that to #data so we can make use of it in
    // addServiceData's volume normalization
    if (data.volumes)
      this.#data.volumes = uniq([...this.#data.volumes, ...Object.keys(data.volumes)]);

    // @TODO: should we try to consolidate this?
    this.#app.add({
      id: `${this.id}-${nanoid()}`,
      info: this.info,
      data: [data],
    });

    // update app with new stuff
    // Compose fragments remain in memory until the app assembles them.

    // update and log
    // App lifecycle owns persistence after successful work.
  }

  // adds files/dirs to the build context
  addContext(context: ImageConfig['context'], group: string | false = 'context') {
    // if we have context info as a string then lets translate into an array
    if (context && typeof context === 'string') context = [context];
    // if we have context info as an object then lets translate into an array
    if (context && !Array.isArray(context) && typeof context === 'object') context = [context];
    // if we have an array of context data then lets normalize it
    if (Array.isArray(context) && context.length > 0) {
      this.#data.sources.push(
        context.map((input) => {
          let file: Partial<BuildSource> | string = input;
          // file is a string with src par
          if (typeof file === 'string' && toPosixPath(file).split(':').length === 1)
            file = { source: file, target: file };
          // file is a string with src and dest parts
          if (typeof file === 'string' && toPosixPath(file).split(':').length === 2) {
            const parts = file.split(':');
            const target = parts.pop();
            const source = parts.join(':');
            file = { source, target };
          }

          if (typeof file === 'string') throw new Error('Invalid build source');

          // normalize object
          if (isObject(file) && !file.source) {
            file.source = file.src;
            delete file.src;
          }
          if (isObject(file) && !file.target) {
            file.target = file.destination ?? file.dest;
            delete file.dest;
            delete file.destination;
          }

          // if source is actually a url then lets address that
          try {
            file.url = new URL(toPosixPath(file.source ?? '')).href;
            delete file.source;
          } catch {
            /* Local paths are not URLs. */
          }

          // at this point we need to make sure a desintation is set
          if (!file.target && file.source) file.target = file.source;
          if (!file.target && file.url) file.target = new URL(file.url).pathname;
          // handle relative source paths
          if (file.source && !path.isAbsolute(file.source))
            file.source = path.resolve(this.appRoot, file.source);

          // handle permissions
          if (file.perms) file.permissions = file.perms;

          // handle ownership
          if (file.user && !file.owner) file.owner = file.user;
          if (file.user && file.group) file.owner = `${file.user}:${file.group}`;

          // handle instructions
          if (!file.instructions) {
            file.instructions = file.url ? ['ADD'] : ['COPY'];
            if (file.owner) file.instructions.push(`--chown=${file.owner}`);
            if (file.permissions) file.instructions.push(`--chmod=${file.permissions}`);
            file.instructions.push(file.url ?? path.posix.resolve('/', file.target ?? ''));
            file.instructions.push(path.posix.resolve('/', file.target ?? ''));
            file.instructions = file.instructions.join(' ');
          }

          // ensure instructions are an array
          if (typeof file.instructions === 'string') file.instructions = [`${file.instructions}`];

          // remove other extraneous keys
          if (isObject(file) && file.group) delete file.group;
          if (isObject(file) && file.perms) delete file.perms;
          if (isObject(file) && file.user) delete file.user;

          // should be ready for all the things eg pushing as a build step
          if (group)
            this.addSteps({ group, instructions: file.instructions.join('\n'), contexted: true });

          // return normalized data
          return file as BuildSource;
        }),
      );
    }
  }

  // add build groups to the service
  addGroups(groups: BuildGroup | BuildGroup[]) {
    // start by making groups into an array if we can
    if (!Array.isArray(groups)) groups = [groups];

    // loop through the groups and merge them in
    if (groups && groups.length > 0) {
      groups.map((group) => {
        // extrapolate short form first, if one key and it isnt id or name then assume a id weight pair
        if (Object.keys(group).length === 1 && !group.id && !group.name) {
          group = { id: Object.keys(group)[0], weight: Object.values(group)[0] as number };
        }

        // merge in
        this.#data.groups = merge({}, this.#data.groups, {
          [group.id ?? group.name ?? 'default']: {
            description: group.description ?? `Build group: ${group.id ?? group.name}`,
            weight: group.weight ?? this.#data.groups.default?.weight ?? 1000,
            stage: group.stage ?? this.#data.groups.default?.stage ?? 'image',
            user: group.user ?? this.#data.groups.default?.user ?? 'root',
          },
        });

        this.debug('%o added build group %o', this.id, group);
      });
    }
  }

  // this handles our changes to docker-composes "image" key
  // @TODO: helper methods to add particular parts of build data eg image, files, steps, groups, etc
  addImageData(data: StringInput | ImageConfig) {
    // make sure data is in object format if its a string then we assume it sets the "imagefile" value
    if (isStringy(data)) data = { imagefile: data };
    // map dockerfile key to image key if it is set and imagefile isnt
    if (!data.imagefile && data.dockerfile) data.imagefile = data.dockerfile;
    // now pass the imagefile stuff into image parsing
    this.setBaseImage(data.imagefile);
    // if the imageInstructions include COPY/ADD then make sure we are adding the dockerfile context directly as a
    // source so those instructions work
    // @NOTE: we are not adding a "context" because if this passes we have the instructions already and just need to make
    // sure the files exists
    // @TODO: move this to a static method?
    if (
      hasInstructions(this.#data.imageInstructions, ['COPY', 'ADD']) &&
      this.#data.imageFileContext
    ) {
      this.#data.sources.push({ source: this.#data.imageFileContext, target: '.' });
    }

    // if we have context data then lets pass that in as well
    if (data.args) this.addBuildArgs(data.args);
    // if we have context data then lets pass that in as well
    if (data.context) this.addContext(data.context);
    // if we have groups data then
    if (data.groups) this.addGroups(data.groups);
    // if we have activated ssh then figure all of that out
    if (data.ssh) this.addSSH(data.ssh);
    // handle steps data
    if (data.steps) this.addSteps(data.steps);
    // if we have a custom tag then set that
    if (data.tag) this.tag = data.tag;

    // finally make sure we honor buildkit disabling
    if (isDisabled(data.buildkit ?? data.buildx ?? this.buildkit)) this.buildkit = false;
  }

  // Handle image instructions separately from the Compose service fields.
  addServiceData(data: ServiceConfig = {}) {
    // if both image and build are set then set the tag to the image
    if (data.build && typeof data.image === 'string') this.tag = data.image;
    // if build is set then prefer that
    if (data.build) this.addBuildData(data.build);
    // otherwise do image
    else if (data.image) this.addImageData(data.image);

    // ensure we are not passing in build/image as we handle those above
    const { build, image, ...compose } = data;

    // handle any appropriate path normalization for volumes
    // @NOTE: this normalization ONLY applies here, not in the generic addComposeData
    if (compose.volumes) compose.volumes = this.normalizeVolumes(compose.volumes);

    // add the data
    this.addComposeData({ services: { [this.id]: compose } });
  }

  addSteps(steps: Step | Step[]) {
    // start by making groups into an array if we can
    if (!Array.isArray(steps)) steps = [steps];

    // then loop through and do what we need to do
    if (steps && steps.length > 0) {
      steps.map((step) => {
        // handle group name overrides first eg break up into group|user|offset
        if (step.group && this.getOverrideGroup(step.group) && this.getGroupOverrides(step.group)) {
          step = merge({}, step, this.getGroupOverrides(step.group));
        }

        // if no group at this point assume default group
        if (!step.group) step.group = 'default';
        // at this point group should be defined and override syntax broken apart, if the step uses an unknown group
        // then log and set it to the default group
        if (this.#data.groups[step.group] === undefined) {
          this.debug(
            '%o does not reference a defined group, using %o group instead',
            step.group,
            'default',
          );
          step.group = 'default';
        }

        // we should have stnadardized groups at this point so we can rebase on defaults as
        step = merge(
          {},
          { stage: this.#data.groups.default?.stage },
          { weight: this.#data.groups.default?.weight, user: this.#data.groups.default?.user },
          this.#data.groups[step.group],
          step,
        );
        // now lets modify the weight by the offset if we have one
        if (step.offset && Number(step.offset)) step.weight = (step.weight ?? 1000) + step.offset;
        // and finally lets rewrite the group for better instruction grouping
        step.group = `${step.group}-${step.weight}-${step.user}`;
        // push
        this.#data.steps.push(step as NormalizedStep);
      });
    }
  }

  // add agent info
  // @TODO: should we throw an error if the socket does not exist or should we just rely on downstream errors?
  addSSHAgent(agent: boolean | string | undefined = process.env.SSH_AUTH_SOCK) {
    // if agent is true then reset it to $SSH_AUTH_SOCK
    if (agent === true) agent = '$SSH_AUTH_SOCK';

    // if ssh agent is a non false stringy value that does not exist on the fs then get the path from envvar
    if (agent !== false && typeof agent === 'string' && !fs.existsSync(agent)) {
      agent = agent.startsWith('$') ? process.env[agent.slice(1)] : process.env[agent];
    }

    // @TODO: make this better?
    this.sshSocket = agent;
  }

  addSSHKeys(keys: boolean | string | string[] = []) {
    // if keys are explicitly set to false then reset keys to be empty
    if (keys === false) {
      this.sshKeys = [];
      return;
    }

    // if ssh keys is true then set it to our default dirs'
    if (keys === true) {
      keys = [
        path.join(os.homedir(), '.ssh'),
        path.resolve(this.#lando.config.userConfRoot, 'keys'),
      ];
    }

    // if keys are a string then arrayify
    if (typeof keys === 'string') keys = [keys];

    // if keys are not an array at this point then do nothing
    if (!Array.isArray(keys)) return;

    // reset keys
    this.sshKeys = [...new Set(this.sshKeys.concat(keys))];
  }

  // add/merge in ssh stuff for buildkit
  addSSH(ssh: ImageConfig['ssh']) {
    // if ssh is explicitly true then that implies agent true and keys true
    if (ssh === true) ssh = { agent: true, keys: true };

    // if ssh is not an object at this point then we need to return false
    if (!ssh || typeof ssh !== 'object') {
      this.debug(
        '%o could not interpret ssh %o, must be boolean or object, setting to false',
        this.id,
        ssh,
      );
      return false;
    }

    // agent
    this.addSSHAgent(ssh.agent);
    // keys
    this.addSSHKeys(ssh.keys);
  }

  // build the image
  async buildImage() {
    // get build func
    const bengine =
      this.#buildEngine ??
      (await L337Service.getBengine(L337Service.bengineConfig, {
        builder: L337Service.builder,
        debug: this.debug,
        orchestrator: L337Service.orchestrator,
      }));
    // separate out imagefile and context
    const { imagefile, ...context } = this.generateBuildContext();

    try {
      const success: BuildContext & { info?: ImageInfo } = {
        imagefile,
        ...context,
      };

      // only build if image is not already built
      if (this?.info?.state?.IMAGE !== 'BUILT') {
        // set state
        this.info = { state: { IMAGE: 'BUILDING' } };
        // run with the appropriate builder
        const result = this.buildkit
          ? await bengine.buildx(imagefile, context)
          : await bengine.build(imagefile, context);
        // augment the success info
        Object.assign(success, result);
      }

      // get the inspect data so we can do other things
      success.info = await bengine.getImage(context.tag!).inspect();

      // add the final compose data with the updated image tag on success
      this.addComposeData({ services: { [context.id]: { image: context.tag } } });
      // set the image stuff into the info
      this.info = { image: imagefile, state: { IMAGE: 'BUILT' }, tag: context.tag };
      this.debug('image %o built successfully from %o', context.id, imagefile);
      return { ...success, info: success.info };

      // failure
    } catch (caught) {
      const error = asError(caught);
      // augment error
      error.context = { imagefile, ...context };
      error.logfile = path.join(context.context ?? os.tmpdir(), `error-${nanoid()}.log`);
      this.debug(
        'image %o build failed with code %o error %o',
        context.id,
        error.code ?? 1,
        error.message,
      );
      this.debug('%o', error?.stack ?? error);

      // Failed builds never produce a runnable fallback service.

      // set the image stuff into the info
      this.info = {
        error: error.short,
        image: undefined,
        state: { IMAGE: 'BUILD FAILURE' },
        tag: undefined,
      };
      this.tag = undefined;

      // then throw
      throw error;
    }
  }

  async destroy() {
    // remove build contexts and tmp
    remove(this.context);
    remove(this.tmpdir);
    this.debug('removed build-context %o', this.context);
    this.debug('removed tmpdir %o', this.tmpdir);
  }

  generateBuildContext(): BuildContext {
    // get dockerfile validator
    // const {validate} = dockerfileUtils;

    // start with instructions that are sorted and grouped
    const grouped = groupBy(
      this.getSteps('image').sort((a, b) => a.weight - b.weight),
      'group',
    );

    const steps: Record<string, string> = {};
    // now iterate through and translate into blocks of docker instructions with user and comments set
    for (const [group, data] of Object.entries(grouped)) {
      // user should be consistent across data so just grab the first one
      const first = data[0];
      if (!first) continue;
      const user = first.user;

      // reset data to array of instructions
      let instructions = data
        .map((data) => data.instructions)
        .map((data) => (Array.isArray(data) ? generateDockerFileFromArray(data) : data));

      // if we have any rogue uncontexted COPY/ADD instructions then we need to add appropriate sources to make sure
      // it all works seemlessly
      if (
        instructions
          .map((step, index) => ({ index, step, contexted: data[index]?.contexted === true }))
          .filter((step) => hasInstructions(step.step, ['COPY', 'ADD']))
          .map((step) => step.contexted)
          .reduce((contexted, step) => contexted || !step, false)
      ) {
        this.#data.sources.push({
          source: this.#data.imageFileContext || this.appRoot,
          target: '.',
        });
      }

      // attempt to normalize newling usage mostly for aesthetic considerations
      instructions = instructions
        .map((instructions) =>
          instructions.split('\n').filter((instruction) => instruction && instruction !== ''),
        )
        .flat();

      // prefix user and comment data and some helpful envvars
      instructions.unshift(`USER ${user}`);
      instructions.unshift(`ENV LANDO_IMAGE_GROUP=${group}`);
      instructions.unshift(`ENV LANDO_IMAGE_USER=${user}`);
      instructions.unshift(`# group: ${group}`);
      // and add a newline for readability
      instructions.push('');
      // and then finally put it all together
      steps[group] = instructions.map((line) => line.trimStart()).join('\n');
    }

    // we should have raw instructions data now
    const instructions = Object.values(steps);
    // unshift whatever we end up with in #data.from to the front of the instructions
    instructions.unshift(this.#data.imageInstructions ?? '');
    instructions.unshift(`# build-context: ${this.context}`);
    instructions.unshift(`# service: ${this.name}`);
    instructions.unshift('# Imagefile generated by Lando.');
    // map instructions to imagefile content
    const content = instructions.join('\n');

    // attempt to validate the content
    // console.log(content);
    // console.log(validate(content));
    // @TODO: generic imagefile validation/linting/etc?or error
    // throw new Error('NO NO NO')

    // write the imagefile
    write(this.imagefile, content);

    // return the build context
    return {
      id: this.id,
      buildArgs: this.buildArgs,
      context: this.context,
      imagefile: this.imagefile,
      sources: [
        ...new Map(
          this.#data.sources
            .flat()
            .filter(Boolean)
            .filter((source) => !source.url)
            .map((source) => [JSON.stringify(source), source]),
        ).values(),
      ],
      sshSocket: this.sshSocket,
      sshKeys: getPassphraselessKeys(this.sshKeys),
      tag: this.tag,
    };
  }

  getSteps(stage?: string) {
    // if we have a stage then filter by that
    if (stage) return this.#data.steps.filter((step) => step.stage === stage);
    // otherwise return the whole thing
    return this.#data.steps;
  }

  // gets group overrides or returns false if there are none
  getGroupOverrides(group: string) {
    // break the group into parts
    const parts = group
      .replace(`${this.getOverrideGroup(group)}`, '')
      .split('-')
      .filter(Boolean);
    if (['pre', 'post'].includes(parts[0] ?? '')) {
      parts[0] = parts[0] === 'pre' ? 'before' : 'after';
      if (parts.length === 1) parts.push('1');
    }

    // if we have nothing then lets return false at this point
    if (parts.length === 0) return false;

    // if not then lets try to parse parts into a step obkect we can merge in
    const step: { group: string | false; offset: number; user?: string } = {
      group: this.getOverrideGroup(group),
      offset: 0,
    };

    // start by trying to grab the first integer number we find and assume this is the offset
    // @TODO: this means that user overrides MUST be passed in as non-castable strings eg usernames not uids
    if (parts.find((part) => Number(part))) {
      step.offset = Number(parts.splice(parts.indexOf(parts.find((part) => Number(part))!), 1)[0]);
    }

    // now lets see if we can find a weight direction, we really only need to check for before since after is the default
    if (parts.find((part) => part === 'before')) step.offset = step.offset * -1;

    // lets make sure we remove both "before" and "after" cause whatever is left is the user
    if (parts.indexOf('before') > -1) parts.splice(parts.indexOf('before'), 1);
    if (parts.indexOf('after') > -1) parts.splice(parts.indexOf('after'), 1);
    step.user = parts.join('-') || 'root';

    // return
    return step;
  }

  // returns the group the override is targeting or false if not really an override
  getOverrideGroup(data: string) {
    // first order the groups by longest string and filter out any that dont start with data
    // this should ensure we end up with an ordered by closest match list
    const candidates = Object.keys(this.#data.groups)
      .sort((a, b) => b.length - a.length)
      .filter(
        (group) =>
          data.startsWith(`${group}-`) ||
          data === group ||
          data.startsWith(`pre-${group}`) ||
          data.startsWith(`post-${group}`),
      );

    // if there is a closest match that is not the group itself then its an override otherwise fise
    const candidate = candidates[0];
    return candidate && candidate !== data ? candidate : false;
  }

  normalizeFileInput(data: StringInput, { dest }: { dest?: string } = {}): string {
    // if data is not a stringy then do something else?
    if (!isStringy(data)) {
      this.debug('%o does not seem to be valid file input data', data);
      return String(data);
    }

    // if data is a single line string then just return it
    if (data.split('\n').length === 1) return path.resolve(this.appRoot, String(data));

    // if dest is undefined and we have ImportString then lets use that filename
    if (dest === undefined && data instanceof ImportString) {
      const { file } = data.getMetadata();
      if (file) dest = path.basename(file);
    }

    // if we are here it is multiline and lets dump to a tmp file and return that
    const file = path.join(this.tmpdir, dest ?? nanoid());
    write(file, data, { forcePosixLineEndings: true });

    return file;
  }

  /**
   * Normalize compose volume input into long syntax objects and ensure bind mount sources exist.
   *
   * @param {Array<string|object>} [volumes] - Compose style volume definitions.
   * @return {Array<string|object>} Normalized volume definitions.
   */
  normalizeVolumes(
    this: Pick<L337Service, '_data' | 'appRoot'>,
    volumes: MountInput[] = [],
  ): (string | Mount)[] {
    if (!Array.isArray(volumes)) return [];

    // normalize and return
    return volumes.map((volume) => {
      // if volume is a one part string then just return so we dont have to handle it downstream
      if (typeof volume === 'string' && toPosixPath(volume).split(':').length === 1) return volume;

      // if volumes is a string with two colon-separated parts then do stuff
      if (typeof volume === 'string' && toPosixPath(volume).split(':').length === 2) {
        const parts = volume.split(':');
        const target = parts.pop();
        const source = parts.join(':');
        volume = { source, target };
      }

      // if volumes is a string with three colon-separated parts then do stuff
      if (typeof volume === 'string' && toPosixPath(volume).split(':').length === 3) {
        const parts = volume.split(':');
        const mode = parts.pop();
        const target = parts.pop();
        const source = parts.join(':');
        volume = { source, target, read_only: mode === 'ro' };
      }

      if (typeof volume === 'string') return volume;

      // at this point we should have an object and if it doesnt have a type we need to try to figure it out
      // which should be PRETTY straightforward as long as named volumes have been added first
      if (!volume.type)
        volume.type = this._data.volumes.includes(volume.source ?? '') ? 'volume' : 'bind';

      // normalize relative bind mount paths to the appRoot
      if (volume.type === 'bind' && !path.isAbsolute(volume.source ?? '')) {
        volume.source = path.join(this.appRoot, volume.source ?? '');
      }

      // Create missing bind directories as the caller, except VM paths and explicit opt-outs.
      if (
        volume.type === 'bind' &&
        !fs.existsSync(volume.source ?? '') &&
        volume.source !== '/run/host-services' &&
        !volume.source?.startsWith('/run/host-services/')
      ) {
        if (volume.bind?.create_host_path !== false) {
          fs.mkdirSync(volume.source ?? '', { recursive: true });
        }
      }

      // return
      return volume as Mount;
    });
  }

  // sets the base image for the service
  setBaseImage(image: StringInput | undefined, buildArgs: BuildConfig = {}) {
    const imported = image instanceof ImportString ? image.getMetadata() : undefined;
    if (imported?.file) {
      this.#data.imageFileContext = path.dirname(imported.file);
      image = String(image);
    }
    if (typeof image !== 'string' || !image.trim())
      throw new Error(`Service ${this.id} requires an image or build input`);
    // if the data is raw imagefile instructions then dump it to a file and set to that file
    if (imported || image.split('\n').length > 1) {
      const content = image;
      image = path.join(this.tmpdir, 'Imagefile');
      fs.mkdirSync(path.dirname(image), { recursive: true });
      write(image, content);
      this.#data.imageFileContext = imported?.file ? path.dirname(imported.file) : this.appRoot;
    }

    // if imagefile is not an absolute path then test it with the approot as a base
    if (!path.isAbsolute(image) && fs.existsSync(path.resolve(this.appRoot, image))) {
      image = path.resolve(this.appRoot, image);
      this.#data.imageFileContext = path.dirname(image);
    }

    if (!imported && fs.existsSync(image)) this.#data.imageFileContext ??= path.dirname(image);

    // at this point we have either a dockerfile or a tagged image, lets set the base first
    this.#data.image = image;

    // and then generate the image instructions and set info
    this.#data.imageInstructions = fs.existsSync(image)
      ? fs.readFileSync(image, 'utf8')
      : generateDockerFileFromArray([{ from: { baseImage: image } }]);
    this.info.image = image;

    // finally lets reset the relevant build key if applicable
    if (fs.existsSync(image)) {
      this.addComposeData({
        services: {
          [this.id]: {
            build: merge({}, buildArgs, {
              dockerfile: path.basename(image),
              context: path.dirname(image),
            }),
          },
        },
      });

      // or the image one if its that one
    } else {
      this.addComposeData({ services: { [this.id]: { image } } });
    }

    // log
    this.debug(
      'set base image to %o with instructions %o',
      this.#data.image,
      this.#data.imageInstructions ?? '',
    );
  }
}

export default L337Service;
