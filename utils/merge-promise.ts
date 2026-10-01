/** Preserve the event-emitter/process surface while adding the original deferred await handler. */
export default function mergePromise<T extends object, R>(
  thing: T,
  promise: Promise<R> | (() => Promise<R>),
): T & Promise<R> {
  const getPromise = () => (typeof promise === 'function' ? promise() : promise);
  const methods = {
    then: ((...args) => getPromise().then(...args)) as Promise<R>['then'],
    catch: ((...args) => getPromise().catch(...args)) as Promise<R>['catch'],
    finally: ((...args) => getPromise().finally(...args)) as Promise<R>['finally'],
  };
  for (const [name, value] of Object.entries(methods)) {
    Object.defineProperty(thing, name, { value, writable: true, configurable: true });
  }
  return thing as T & Promise<R>;
}
