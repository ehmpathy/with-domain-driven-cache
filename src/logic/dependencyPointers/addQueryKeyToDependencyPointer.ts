import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import Bottleneck from 'bottleneck';
import { createCache } from 'simple-in-memory-cache';
import { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import { SimpleAsyncCache, withSimpleCache } from 'with-simple-cache';

export const isValidPointerState = (
  state: SerializableObject,
): state is { queries: string[] } =>
  !!state &&
  typeof state === 'object' &&
  'queries' in state &&
  Array.isArray(state.queries);

/**
 * a method which finds or creates a bottleneck for a given pointer, for conducting query.key operations without parallelism
 *
 * strategy
 * - uses a simple-in-memory-cache to reuse the existing one, or create a new one if does not exist otherwise
 *
 * purpose
 * - prevent parallel writes from the same machine to the same queryKey store for a given pointer
 */
const getConcurrencyBottleneckForPointer = withSimpleCache(
  ({}: { pointer: string }) => new Bottleneck({ maxConcurrent: 1 }),
  { cache: createCache({ expiration: { seconds: Infinity } }) },
);

/**
 * adds a query key to a dependency pointer
 *
 * constraints
 * - each dependency pointer may have 0 or more queries already dependent on it
 * - we must make sure to retain all existing queries dependent on it, adding a new key
 * - we must make sure that parallel writes don't overwrite eachother -> miss data
 *
 * strategy
 * - within a in-memory bottleneck of maxConcurrency=1 per dependency.pointer...
 *   - objective: eliminate in-memory parallel writes on the same pointer
 *   - strategy:
 *     - finsert bottleneck for pointer via simple-in-memory-cache
 *     - bottleneck.schedule w/ concurrency = 1 -> only one write at a time
 *     - log.warn if backed up w/ more than 10 parallel writes at a time per partition -> may want todo batch execute // TODO
 * - ...update the queries identified as dependent for the pointer
 *   - look up all of the existing queries dependent on the pointer
 *   - append this query
 *   - write to cache
 *
 * todo: enable optimistic write locks -> prevent concurrent writes across machines, not just in memory
 */
export const addQueryKeyToDependencyPointer = async ({
  cache,
  pointer,
  queryKey,
}: {
  cache: SimpleAsyncCache<SerializableObject>;
  pointer: string;
  queryKey: string;
}): Promise<void> => {
  // grab the concurrency bottleneck for this specific pointer
  const bottleneck = getConcurrencyBottleneckForPointer({
    pointer,
  });

  // within that bottleneck
  await bottleneck.schedule(async () => {
    // lookup the current state of queries referenced by that pointer
    const stateBefore = await cache.get(pointer);

    // if the state before did not exist or was corrupt, overwrite it
    if (!isValidPointerState(stateBefore)) {
      // if the data was corrupt, fail fast, since that means something is corrupting the pointer state and cache will have stale data
      if (!!stateBefore)
        throw new UnexpectedCodePathError(
          'detected corrupt $query.ref dependency.pointer state. stale cache data may exist',
          { pointer, stateBefore },
        );

      // otherwise, it just wasn't set yet, so set the initial value
      return await cache.set(
        pointer,
        { queries: [queryKey] },
        {
          expiration: { seconds: Infinity }, // never expire these -> may lead to stale cached data otherwise
        },
      );
    }

    // if the query is already included, nothing more to do
    const alreadyIncluded = stateBefore.queries.includes(queryKey);
    if (alreadyIncluded) return; // no op, since already accounted for

    // since its not, update the state to track it
    await cache.set(
      pointer,
      {
        queries: [...stateBefore.queries, queryKey],
      },
      {
        expiration: { seconds: Infinity }, // never expire these -> may lead to stale cached data otherwise
      },
    );
  });
};
