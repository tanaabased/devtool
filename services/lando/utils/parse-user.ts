import type { UserConfig } from '../../../components/service.ts';
import isObject from 'lodash-es/isPlainObject.js';

export default (user: unknown): UserConfig => {
  // if user is nully then return empty object
  if (user === undefined || user === null || user === false) return {};

  // if user is a string then lets break it into parts and put it into an object
  if (typeof user === 'string') {
    const parts = user.split(':');
    user = { gid: parts[2], uid: parts[1], name: parts[0] };
  }

  // if user is an object
  if (isObject(user)) {
    const input = user as UserConfig;
    // we want user.name to the canonical ones
    input.name = input.name ?? input.user ?? input.username;
    delete input.user;
    delete input.username;

    // remove undefined keys
    for (const key of Object.keys(input) as (keyof UserConfig)[]) {
      if (input[key] === undefined) delete input[key];
    }

    // return
    return input;
  }

  // if we get here i guess just return an empty object?
  // throw an error?
  return {};
};
