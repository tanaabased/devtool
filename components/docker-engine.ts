import type { Debugger } from 'debug';
import type { BuildOptions, ImageInfo, Volume, VolumeInput } from '../lib/types.ts';
import type { CommandSuccess } from '../utils/make-success.ts';
interface Progress {
  id?: string;
  status?: string;
  progress?: string;
  stream?: string;
}
import asError from '../utils/as-error.ts';
import fs from 'fs-extra';
import path from 'node:path';
import merge from 'lodash-es/merge.js';
import Dockerode from 'dockerode';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
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
}

export default DockerEngine;
