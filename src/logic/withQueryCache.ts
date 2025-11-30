import {
  normalizeDomainObjectReferences,
  withNormalization,
  withSerialization,
} from 'with-cache-normalization';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleCache } from 'with-simple-cache';
import type { LogMethod } from '../domain/constants';
import type { DomainDrivenQueryDependsOn } from '../domain/DomainDrivenQueryDependsOn';
import { addQueryKeyToDependencyPointer } from './dependencyPointers/addQueryKeyToDependencyPointer';
import { getDependencyPointersDependedOnByQuery } from './dependencyPointers/getDependencyPointersDependedOnByQuery';

export const DEFAULT_REFERENCE_SECONDS_UNTIL_EXPIRATION = 30 * 24 * 60 * 60; // keep them for a long time, since otherwise we may invalidate queries before they should be

/**
 * adds domain driven caching to a domain.logic.query
 *
 * features
 * - ✨ automatic cache updates are enabled out of the box, due to [domain.object dereferencing](../../readme.md)
 * - ✨ automatic cache invalidation can be easily enabled by defining what your query dependsOn, due to [dependency pointers](../../readme.md)
 * - 🔭 observable tracing of underlying operations can be easily enabled by passing in the logMethod you'd like operations to be reported to
 *
 * note
 * - ⚠️ ensure all of the domain.object relationships and identities your domain.logic.query depends on are explicitly defined via the `dependsOn` attribute, to activate automated cache invalidation
 */
export const withQueryCache = <I extends any[], O extends SerializableObject>(
  logic: (...args: I) => Promise<O>,
  options: {
    /**
     * the cache to use
     */
    cache: SimpleCache<string>;

    /**
     * the logical dependencies of your domain.logic.query
     *
     * note
     * - the dependencies listed here drive the automatic cache invalidation ✨
     * - ensure all logical dependencies are listed to prevent stale data in the cache ⚠️
     *
     * for example
     * - a query called `getPaymentByUuid({ uuid }) => Payment | null` will likely have a dependency on `{ identity: { dobj: Payment, uuid: ({ input }) => input[0].uuid } }`
     * - a query called `getLastPaymentOfUser({ userUuid }) => Payment` will likely have a dependency on `{ relationship: { from: { dobj: User, uuid: ({ input }) => input[0].uuid }, to: { dobj: Payment }, via: { dobj: Payment, prop: 'userUuid' } }`
     *
     * tips
     * - you can see the dependency pointers your query will be invalidated by, by searching for logs with the message `ddcache.query.set`. if `logDebug` is set, this log will be emitted each time your query is set to the cache
     */
    dependsOn: DomainDrivenQueryDependsOn<I, O>;

    /**
     * the serialization strategy to use
     */
    serialize?: {
      /**
       * the key serialization strategy to use
       *
       * note
       * - if you expect to use this with [simple-lambda-client](https://github.com/ehmpathy/simple-lambda-client), be sure to use it's `getSimpleLambdaClientCacheKey` method
       */
      key: (...args: I) => string;
    };

    /**
     * a method to define whether the the results are valid to cache
     *
     * for example
     * - invalidate null results from the start -> queries will hit underlying data store until result is found
     */
    valid?: ({ input, output }: { input: I; output: O }) => boolean;

    /**
     * a custom seconds until expiration to use for this query, if desired
     */
    secondsUntilExpiration?: number;

    /**
     * the log method via which to report debug logs, if observability is desired 🔭
     */
    logDebug?: LogMethod;
  },
): ((...args: I) => Promise<O>) => {
  // add domain.object reference normalization and serialization to the cache the user asked to use, for automatic cache updates
  const cache = withNormalization(
    withSerialization<SerializableObject>(options.cache),
    {
      normalize: normalizeDomainObjectReferences,
      referenceSecondsUntilExpiration:
        DEFAULT_REFERENCE_SECONDS_UNTIL_EXPIRATION,
    },
  );

  // define the query with caching
  return async (...input: I): Promise<O> => {
    // the key to use for the cache for this request
    const key = options.serialize?.key(...input) ?? JSON.stringify(input);

    // check whether the response is already the cache
    const found = await cache.get(key);
    if (found) {
      if (options.logDebug) options.logDebug('ddcache.query.get.hit', { key });
      return found as O; //if it is, we're donzo! no need to run the expensive logic
    }
    if (options.logDebug) options.logDebug('ddcache.query.get.miss', { key });

    // execute the logic to get the response
    const output = await logic(...input);

    // determine if the output is valid
    const isValidCacheEntry =
      !options.valid || options.valid({ input, output });
    if (!isValidCacheEntry) {
      if (options.logDebug)
        options.logDebug('ddcache.query.set.skip', {
          key,
          valid: isValidCacheEntry,
        });
      return output; // if its not a valid cache entry, don't save it to the cache
    }

    // set the dependency pointers for this query to the cache (do this first, to ensure the query isn't cached until its dependency pointers are, preventing missed invalidations in case of partial success)
    const pointers = getDependencyPointersDependedOnByQuery({
      dependsOn: options.dependsOn,
      execution: {
        input,
        output,
      },
    });
    await Promise.all(
      pointers.map((pointer) =>
        addQueryKeyToDependencyPointer({ cache, pointer, queryKey: key }),
      ),
    );

    // set the value to the cache
    await cache.set(key, output, {
      expiration: options.secondsUntilExpiration
        ? { seconds: options.secondsUntilExpiration }
        : undefined,
    });
    if (options.logDebug)
      options.logDebug('ddcache.query.set', { key, deps: pointers });

    // return the cached value
    const foundNow = await cache.get(key);
    if (!foundNow)
      console.warn(
        'could not get value from cache immediately after setting. is something wrong? returning the value directly for now to not block operation',
        { key },
      );
    return foundNow as O;
  };
};
