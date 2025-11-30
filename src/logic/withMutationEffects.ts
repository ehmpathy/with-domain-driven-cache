import {
  normalizeDomainObjectReferences,
  withSerialization,
} from 'with-cache-normalization';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleCache } from 'with-simple-cache';

import type { LogMethod } from '../domain/constants';
import { getDependencyPointersInvalidatedByMutation } from './dependencyPointers/getDependencyPointersInvalidatedByMutation';
import { invalidateQueriesByDependencyPointer } from './dependencyPointers/invalidateQueriesByDependencyPointer';
import { DEFAULT_REFERENCE_SECONDS_UNTIL_EXPIRATION } from './withQueryCache';

/**
 * adds domain driven cache effects to a domain.logic.mutation
 *
 * features
 * - ✨ automatic cache updates are driven by the outputs of your mutation, via [domain.object dereferencing](../../readme.md)
 * - ✨ automatic cache invalidation are driven by the outputs of your mutation, via [dependency pointers](../../readme.md)
 * - 🔭 observable tracing of underlying operations can be easily enabled by passing in the logMethod you'd like operations to be reported to
 *
 * note
 * - ⚠️ ensure all of the domain.objects affected by your mutation are included in the output, to drive the automatic cache updates and invalidations
 */
export const withMutationEffects = <
  I extends any[],
  O extends SerializableObject,
>(
  logic: (...args: I) => Promise<O>,
  options: {
    /**
     * the cache to use
     */
    cache: SimpleCache<string>;

    /**
     * the log method via which to report debug logs, if observability is desired 🔭
     */
    logDebug?: LogMethod;
  },
): typeof logic => {
  // add domain.object reference normalization and serialization to the cache the user asked to use, for automatic cache updates
  const cache = withSerialization<SerializableObject>(options.cache);

  // execute the mutation with effects
  return async (
    ...input: Parameters<typeof logic>
  ): ReturnType<typeof logic> => {
    // execute the logic and get the response
    const output = await logic(...input);

    // trigger cache invalidations based on the response
    const pointers = await getDependencyPointersInvalidatedByMutation({
      cache,
      output,
    });
    const queriesInvalidated = (
      await Promise.all(
        pointers.map((pointer) =>
          invalidateQueriesByDependencyPointer({ cache, pointer }),
        ),
      )
    ).flat();

    // trigger cache updates by setting the normalized references to the cache
    const { references } = normalizeDomainObjectReferences({ value: output });
    await Promise.all(
      Object.entries(references).map(([refKey, refDobj]) =>
        cache.set(refKey, refDobj, {
          expiration: { seconds: DEFAULT_REFERENCE_SECONDS_UNTIL_EXPIRATION },
        }),
      ),
    );

    // log about the outcome
    if (options.logDebug)
      options.logDebug('ddcache.mutation.effects', {
        updated: {
          references: Object.keys(references),
        },
        evaluated: {
          deps: pointers,
        },
        invalidated: {
          queries: queriesInvalidated,
        },
      });

    // return the output
    return output;
  };
};
