import type { Debugger } from 'debug';
import type { BuildOptions, Command, ImageInfo, Volume, VolumeInput } from '../lib/types.ts';
import type { CommandSuccess } from '../utils/make-success.ts';
interface Progress {
  id?: string;
  status?: string;
  progress?: string;
  stream?: string;
}
interface DockerRunOptions {
  image?: string;
  tag?: string;
  createOptions?: Dockerode.ContainerCreateOptions;
  allo?: string;
  attach?: boolean;
  interactive?: boolean;
  stream?: NodeJS.WritableStream | null;
  stdouto?: string;
  stderro?: string;
}
import asError from '../utils/as-error.ts';
import fs from 'fs-extra';
import path from 'node:path';
import merge from 'lodash/merge.js';
import slugify from 'slugify';
import Dockerode from 'dockerode';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { PassThrough } from 'node:stream';
import makeError from '../utils/make-error.ts';
import makeSuccess from '../utils/make-success.ts';
import mergePromise from '../utils/merge-promise.ts';
import read from '../utils/read-file.ts';
import remove from '../utils/remove.ts';
import write from '../utils/write-file.ts';
import debugModule from 'debug';
import os from 'node:os';
import copyBuildSource from '../utils/copy-build-source.ts';
import glob from 'glob';
import getPassphraselessKeys from '../utils/get-passphraseless-keys.ts';
import runCommand from '../utils/run-command.ts';
import getBuildxError from '../utils/get-buildx-error.ts';
import stringArgv from 'string-argv';

class DockerEngine {
  private docker: Dockerode;
  builder: string;
  debug: Debugger;
  orchestrator?: string;
  getImage(tag: string): { inspect(): Promise<ImageInfo> } {
    return this.docker.getImage(tag);
  }

  async listVolumes(): Promise<{ Volumes: Volume[] }> {
    const result = await this.docker.listVolumes();
    return { Volumes: result.Volumes ?? [] };
  }
  async createVolume(options: VolumeInput): Promise<unknown> {
    return this.docker.createVolume(options);
  }
  getVolume(name: string): {
    id?: string;
    remove(options?: { force?: boolean }): Promise<unknown>;
  } {
    return this.docker.getVolume(name);
  }

  static name = 'docker-engine';
  static cspace = 'docker-engine';
  static config = {};
  static debug = debugModule('docker-engine');
  static builder = undefined;
  static orchestrator = undefined;
  // @NOTE: is wsl accurate here?
  // static supportedPlatforms = ['linux', 'wsl'];

  constructor(
    config: Dockerode.DockerOptions,
    {
      builder = 'docker',
      debug = DockerEngine.debug,
      orchestrator = DockerEngine.orchestrator,
    }: { builder?: string; debug?: Debugger; orchestrator?: string } = {},
  ) {
    this.docker = new Dockerode(config);
    this.builder = builder;
    this.debug = debug;
    this.orchestrator = orchestrator;
  }

  /*
   * this is the legacy rest API image builder eg NOT buildx
   * this is a wrapper around Dockerode.build that provides either an await or return implementation.
   *
   * @param {*} command
   * @param {*} param1
   */
  build(
    dockerfile: string,
    {
      tag,
      buildArgs = {},
      attach = false,
      context = path.join(os.tmpdir(), nanoid()),
      id = tag,
      sources = [],
      excludePaths = [],
    }: BuildOptions = {},
  ) {
    // handles the promisification of the merged return
    const awaitHandler = async () => {
      return new Promise<CommandSuccess>((resolve, reject) => {
        // if we are not attaching then lets log the progress to the debugger
        if (!attach) {
          builder.on('progress', (data) => {
            // handle pully messages
            if (data.id && data.status) {
              if (data.progress) debug('%s %o', data.status, data.progress);
              else debug('%s', data.status);
            }

            // handle buildy messages
            if (data.stream) debug('%s', data.stream);
          });
        }

        // handle resolve/reject
        builder.on('done', (output) => {
          resolve(makeSuccess(merge({}, args, { stdout: output[output.length - 1].status })));
        });
        builder.on('error', (error) => {
          reject(makeError(merge({}, args, { error })));
        });
      });
    };

    // handles the callback to super.pull
    // @TODO: event to pass through stream?
    const callbackHandler = (error: Error | null, stream?: NodeJS.ReadableStream) => {
      // this ensures we have a consistent way of returning errors
      if (error) builder.emit('error', error);

      // if attach is on then lets stream output
      if (stream && attach) stream.pipe(process.stdout);

      // finished event
      const finished = (err: Error | null, output: Progress[]) => {
        // if an error then fire error event
        if (err) builder.emit('error', err, output);
        // fire done no matter what?
        builder.emit('done', output);
        builder.emit('finished', output);
        builder.emit('success', output);
      };

      // progress event
      const progress = (event: Progress) => {
        builder.emit('data', event);
        builder.emit('progress', event);
      };

      // eventify the stream
      if (stream) this.docker.modem.followProgress(stream, finished, progress);
    };

    // error if no dockerfile
    if (!dockerfile) throw new Error('you must pass a dockerfile into engine.build');
    // error if no dockerfile exits
    if (!fs.existsSync(dockerfile)) throw new Error(`${dockerfile} does not exist`);

    // extend debugger in appropriate way
    const debug = id ? this.debug.extend(id) : this.debug.extend('docker-engine:build');

    // wipe context dir so we get a fresh slate each build
    remove(context);
    fs.mkdirSync(context, { recursive: true });

    // move other sources into the build context
    for (const source of sources) {
      try {
        copyBuildSource(source, context, excludePaths);
      } catch (caught) {
        const error = asError(caught);
        error.message = `Failed to copy ${source.source} into build context at ${source.target}!: ${error.message}`;
        throw error;
      }
    }

    // copy the dockerfile to the correct place
    // @NOTE: we do this last to ensure we overwrite any dockerfile that may happenstance end up in the build-context
    // from source above
    fs.copySync(dockerfile, path.join(context, 'Dockerfile'));

    // on windows we want to ensure the build context has linux line endings
    if (process.platform === 'win32') {
      for (const file of glob.sync(path.join(context, '**/*'), { nodir: true })) {
        write(file, read(file), { forcePosixLineEndings: true });
      }
    }

    // collect some args we can merge into promise resolution
    // @TODO: obscure auth?
    const args = { command: 'dockerode buildImage', args: { dockerfile, tag, sources } };
    // create an event emitter we can pass into the promisifier
    const builder = new EventEmitter();

    // call the parent
    // @TODO: consider other opts? https://docs.docker.com/engine/api/v1.43/#tag/Image/operation/ImageBuild args?
    debug('building image %o from %o writh build-args %o', tag, context, buildArgs);
    this.docker.buildImage(
      {
        context,
        src: fs.readdirSync(context),
      },
      {
        buildargs: JSON.stringify(buildArgs),
        forcerm: true,
        t: tag,
      },
      callbackHandler,
    );

    // make this a hybrid async func and return
    return mergePromise(builder, awaitHandler);
  }

  /*
   * this is the buildx image builder
   *
   * unfortunately dockerode does not have an endpoint for this
   * see: https://github.com/apocas/dockerode/issues/601
   *
   * so we are invoking the cli directly
   *
   * @param {*} command
   * @param {*} param1
   */
  buildx(
    dockerfile: string,
    {
      tag,
      buildArgs = {},
      context = path.join(os.tmpdir(), nanoid()),
      id = tag,
      ignoreReturnCode = false,
      sshKeys = [],
      sshSocket = false,
      sources = [],
      excludePaths = [],
      stderr = '',
      stdout = '',
    }: BuildOptions = {},
  ) {
    // handles the promisification of the merged return
    const awaitHandler = async () => {
      return new Promise<CommandSuccess>((resolve, reject) => {
        // handle resolve/reject
        buildxer.on('done', ({ code, stdout, stderr }) => {
          debug('command %o done with code %o', args, code);
          resolve(makeSuccess(merge({}, args, code, stdout, stderr)));
        });
        buildxer.on('error', (error) => {
          debug('command %o error %o', args, error?.message);
          reject(error);
        });
      });
    };

    // error if no dockerfile
    if (!dockerfile) throw new Error('you must pass a dockerfile into buildx');
    // error if no dockerfile exits
    if (!fs.existsSync(dockerfile)) throw new Error(`${dockerfile} does not exist`);

    // extend debugger in appropriate way
    const debug = id ? this.debug.extend(id) : this.debug.extend('docker-engine:buildx');

    // wipe context dir so we get a fresh slate each build
    remove(context);
    fs.mkdirSync(context, { recursive: true });

    // move sources into the build context if needed
    for (const source of sources) {
      try {
        copyBuildSource(source, context, excludePaths);
      } catch (caught) {
        const error = asError(caught);
        error.message = `Failed to copy ${source.source} into build context at ${source.target}!: ${error.message}`;
        throw error;
      }
    }

    // on windows we want to ensure the build context has linux line endings
    if (process.platform === 'win32') {
      for (const file of glob.sync(path.join(context, '**/*'), { nodir: true })) {
        write(file, read(file), { forcePosixLineEndings: true });
      }
    }

    // copy the dockerfile to the correct place and reset
    fs.copySync(dockerfile, path.join(context, 'Dockerfile'));
    dockerfile = path.join(context, 'Dockerfile');

    // build initial buildx command
    const args = {
      command: this.builder,
      args: [
        'buildx',
        'build',
        `--file=${dockerfile}`,
        '--load',
        '--progress=plain',
        `--tag=${tag}`,
        context,
      ],
    };

    // add any needed build args into the command
    for (const [key, value] of Object.entries(buildArgs))
      args.args.push(`--build-arg=${key}=${value}`);

    // if we have sshKeys then lets pass those in
    if (sshKeys.length > 0) {
      // ensure we have good keys
      sshKeys = getPassphraselessKeys(sshKeys);
      // first add all the keys with id "keys"
      args.args.push(`--ssh=keys=${sshKeys.join(',')}`);
      // then add each key separately with its name as the key
      for (const key of sshKeys) args.args.push(`--ssh=${path.basename(key)}=${key}`);
      // log
      debug('passing in ssh keys %o', sshKeys);
    }

    // if we have an sshAuth socket then add that as well
    if (sshSocket && fs.existsSync(sshSocket)) {
      args.args.push(`--ssh=agent=${sshSocket}`);
      debug('passing in ssh agent socket %o', sshSocket);
    }

    // get builder
    // @TODO: consider other opts? https://docs.docker.com/reference/cli/docker/buildx/build/ args?
    // secrets?
    // gha cache-from/to?
    const buildxer = runCommand(args.command, args.args, { debug });

    // augment buildxer with more events so it has the same interface as build
    buildxer.stdout.on('data', (data) => {
      buildxer.emit('data', data);
      buildxer.emit('progress', data);
      for (const line of data.toString().trim().split('\n')) debug(line);
      stdout += data;
    });
    buildxer.stderr.on('data', (data) => {
      buildxer.emit('data', data);
      buildxer.emit('progress', data);
      for (const line of data.toString().trim().split('\n')) debug(line);
      stderr += data;
    });
    buildxer.on('close', (code) => {
      // if code is non-zero and we arent ignoring then reject here
      if (code !== 0 && !ignoreReturnCode) {
        buildxer.emit('error', getBuildxError({ code: code ?? 1, stdout, stderr }));
        // otherwise return done
      } else {
        buildxer.emit('done', { code, stdout, stderr });
        buildxer.emit('finished', { code, stdout, stderr });
        buildxer.emit('success', { code, stdout, stderr });
      }
    });

    // debug
    debug('buildxing image %o from %o with build-args', tag, context, buildArgs);

    // return merger
    return mergePromise(buildxer, awaitHandler);
  }

  /*
   * A helper method that automatically will build the image needed for the run command
   * NOTE: this is only available as async/await so you cannot return directly and access events
   *
   * @param {*} command
   * @param {*} param1
   */
  async buildNRun(
    dockerfile: string,
    command: Command,
    {
      sources,
      tag,
      context,
      createOptions = {},
      attach = false,
    }: BuildOptions & DockerRunOptions = {},
  ) {
    // if we dont have a tag we need to set something
    if (!tag) tag = slugify(nanoid()).toLowerCase();
    // build the image
    await this.build(dockerfile, { attach, context, sources, tag });
    // run the command
    await this.run(command, { attach, createOptions, tag });
  }

  /*
   * Add async info to the engine.
   *
   * @param {*} options
   * @returns
   */
  async init() {
    // const engine = new DockerEngine(options);
    // engine.info = await super.info();
    // return engine;
  }

  /*
   * This is intended for pulling images
   * This is a wrapper around Dockerode.pull that provides either an await or return implementation eg:
   *
   * @param {*} command
   * @param {*} param1
   */
  pull(
    image: string,
    { auth, attach = false }: { auth?: Dockerode.AuthConfig; attach?: boolean } = {},
  ) {
    // handles the promisification of the merged return
    const awaitHandler = async () => {
      return new Promise<CommandSuccess>((resolve, reject) => {
        // if we are not attaching then lets log the progress to the debugger
        if (!attach) {
          puller.on('progress', (progress) => {
            // extend debugger in appropriate way
            const debug = progress.id
              ? this.debug.extend(`pull:${image}:${progress.id}`)
              : this.debug.extend(`pull:${image}`);
            // only debug progress if we can
            if (progress.progress) debug('%s %o', progress.status, progress.progress);
            // otherwise just debug status
            else debug('%s', progress.status);
          });
        }

        // handle resolve/reject
        puller.on('done', (output) => {
          resolve(makeSuccess(merge({}, args, { stdout: output[output.length - 1].status })));
        });
        puller.on('error', (error) => {
          reject(makeError(merge({}, args, { error })));
        });
      });
    };

    // handles the callback to super.pull
    const callbackHandler = async (error: Error | null, stream?: NodeJS.ReadableStream) => {
      // this ensures we have a consistent way of returning errors
      if (error) puller.emit('error', error);

      // if attach is on then lets stream output
      if (stream && attach) stream.pipe(process.stdout);

      // finished event
      const finished = (err: Error | null, output: Progress[]) => {
        // if an error then fire error event
        if (err) puller.emit('error', err, output);
        // fire done no matter what?
        puller.emit('done', output);
        puller.emit('finished', output);
        puller.emit('success', output);
      };

      // progress event
      const progress = (event: Progress) => {
        puller.emit('data', event);
        puller.emit('progress', event);
      };

      // eventify the stream if we can
      if (stream) this.docker.modem.followProgress(stream, finished, progress);
    };

    // error if no command
    if (!image) throw new Error('you must pass an image (repo/image:tag) into engine.pull');

    // collect some args we can merge into promise resolution
    const args = { command: 'dockerode pull', args: { image, auth, attach } };
    // create an event emitter we can pass into the promisifier
    const puller = new EventEmitter();
    // call the parent with clever stuff
    this.docker.pull(image, { authconfig: auth }, callbackHandler);
    // log
    this.debug('pulling image %o', image);
    // make this a hybrid async func and return
    return mergePromise(puller, awaitHandler);
  }

  /*
   * A helper method that automatically will pull the image needed for the run command
   * NOTE: this is only available as async/await so you cannot return directly and access events
   *
   * @param {*} command
   * @param {*} param1
   */
  async pullNRun(
    image: string,
    command: Command,
    {
      auth,
      attach = false,
      createOptions = {},
    }: DockerRunOptions & { auth?: Dockerode.AuthConfig } = {},
  ) {
    // pull the image
    await this.pull(image, { attach, auth });
    // run the command
    await this.run(command, { attach, createOptions, image });
  }

  /*
   * This is intended for ephermeral none-interactive "one off" commands. Use `exec` if you want to run a command on a
   * pre-existing container.
   *
   * This is a wrapper around Dockerode.run that provides either an await or return implementation eg:
   *
   * @param {*} command
   * @param {*} param1
   */
  run(
    command: Command,
    {
      image = 'node:18-alpine',
      createOptions = {},
      allo = '',
      attach = false,
      interactive = false,
      stream = null,
      stdouto = '',
      stderro = '',
    }: DockerRunOptions = {},
  ) {
    const awaitHandler = async () => {
      // stdin helpers
      const resizer = (container: Dockerode.Container) => {
        const dimensions = { h: process.stdout.rows, w: process.stderr.columns };
        if (dimensions.h != 0 && dimensions.w != 0) container.resize(dimensions, () => {});
      };
      const closer = (isRaw = process.stdin.isRaw) => {
        if (interactive) {
          process.stdout.removeListener('resize', resizer);
          process.stdin.removeAllListeners();
          process.stdin.setRawMode(isRaw);
          process.stdin.resume();
        }
      };

      return new Promise<CommandSuccess>((resolve, reject) => {
        let prevkey: string | Buffer | undefined;
        const CTRL_P = '\u0010';
        const CTRL_Q = '\u0011';

        const aopts = {
          stream: true,
          stdout: true,
          stderr: true,
          hijack: interactive,
          stdin: interactive,
        };
        const isRaw = process.stdin.isRaw;
        const stdout = new PassThrough();
        const stderr = new PassThrough();

        runner.on('container', (container: Dockerode.Container) => {
          container.attach(aopts, (error: Error | null, stream?: NodeJS.ReadWriteStream) => {
            if (error) runner.emit('error', error);

            if (!stream) return;
            // handle attach dynamics
            if (attach) {
              // if tty and just pipe everthing to stdout
              if (copts.Tty) {
                stream.pipe(process.stdout);
                // otherwise we should be able to pipe both
              } else {
                stdout.pipe(process.stdout);
                stderr.pipe(process.stderr);
              }
            }

            // handle tty case
            if (copts.Tty) stream.on('data', (buffer) => runner.emit('stdout', buffer));
            // handle demultiplexing
            else {
              stdout.on('data', (buffer) => runner.emit('stdout', buffer));
              stderr.on('data', (buffer) => runner.emit('stderr', buffer));
              this.docker.modem.demuxStream(stream, stdout, stderr);
            }

            // handle interactive
            if (interactive) {
              process.stdin.resume();
              process.stdin.setEncoding('utf8');
              process.stdin.setRawMode(true);
              process.stdin.pipe(stream);
              process.stdin.on('data', (key) => {
                if (prevkey === CTRL_P && key === CTRL_Q) closer(isRaw);
                prevkey = key;
              });
            }

            // make sure we close child streams when the parent is done
            stream.on('end', () => {
              try {
                stdout.end();
              } catch {
                /* Streams may already be closed. */
              }

              try {
                stderr.end();
              } catch {
                /* Streams may already be closed. */
              }
            });
          });

          // if we get here we should have access to the container object so we should be able to collect output?
          // extend the debugger
          const debug = this.debug.extend(`run:${image}:${container.id.slice(0, 4)}`);
          // collect and debug stdout
          runner.on('stdout', (buffer) => {
            stdouto += String(buffer);
            allo += String(buffer);
            if (!attach) debug.extend('stdout')(String(buffer));
          });
          // collect and debug stderr
          runner.on('stderr', (buffer) => {
            stderro += String(buffer);
            allo += String(buffer);
            if (!attach) debug.extend('stderr')(String(buffer));
          });
        });

        // handle resolve/reject
        runner.on('done', (data) => {
          closer(isRaw);
          resolve(
            makeSuccess(
              merge(
                {},
                data,
                { command: copts.Entrypoint, all: allo, stdout: stdouto, stderr: stderro },
                { args: command },
              ),
            ),
          );
        });
        runner.on('error', (error) => {
          closer(isRaw);
          reject(
            makeError(
              merge(
                {},
                args,
                { command: copts.Entrypoint, all: allo, stdout: stdouto, stderr: stderro },
                { args: command },
                { error },
              ),
            ),
          );
        });
      });
    };

    // handles the callback to super.run
    const callbackHandler = (error: Error | null, data: { StatusCode: number }) => {
      // emit error first
      if (error) runner.emit('error', error);
      else if (data.StatusCode !== 0) runner.emit('error', data);
      // fire done no matter what?
      runner.emit('done', data);
      runner.emit('finished', data);
      runner.emit('success', data);
    };

    // error if no command
    if (!command) throw new Error('you must pass a command into engine.run');
    // arrayify commands that are strings
    if (typeof command === 'string') command = stringArgv(command);
    // some good default createOpts
    const defaultCreateOptions = {
      AttachStdin: interactive,
      AttachStdout: attach,
      AttachStderr: attach,
      HostConfig: { AutoRemove: true },
      Tty: interactive || attach,
      OpenStdin: true,
      StdinOnce: true,
    };

    // merge our create options over the defaults
    const copts: Dockerode.ContainerCreateOptions = merge({}, defaultCreateOptions, createOptions);
    // collect some args we can merge into promise resolution
    const args = { args: { command, image, copts, attach, stream } };
    // call the parent with clever stuff
    const runner = this.docker.run(image, command, stream ?? [], copts, {}, callbackHandler);
    // log
    this.debug(
      'running command %o on image %o with create opts %o',
      [copts.Entrypoint, command].flat(),
      image,
      copts,
    );
    // make this a hybrid async func and return
    return mergePromise(runner, awaitHandler);
  }
}

export default DockerEngine;
