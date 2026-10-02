const clone = <T>(value: T): T => {
  if (value && typeof value === 'object' && 'getMetadata' in value) return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  return value;
};

export default clone;
