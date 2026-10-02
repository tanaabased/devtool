import isObject from 'lodash-es/isPlainObject.js';

export default (options: unknown) => {
  // if options are a string then make into an array
  if (typeof options === 'string') options = [options];
  // if options are an object then break into options pairs
  if (isObject(options)) {
    options = Object.entries(options as Record<string, unknown>)
      .map(([key, value]) => [`--${key}`, value])
      .flat();
  }
  // if options are an array then combine into a string and return
  if (Array.isArray(options)) return options.join(' ');
  // otherwise just return an empty string?
  return '';
};
