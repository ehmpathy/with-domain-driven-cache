import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleAsyncCache } from 'with-simple-cache';

import { isValidPointerState } from './addQueryKeyToDependencyPointer';

/**
 * tactic: invalidate queries by dependency pointer
 * purpose: ensure no stale query outputs are cached by invalidating them when we're told a dependency pointer has been impacted
 * strategy:
 *  - lookup the queries dependent on the pointer, by accessing the pointers state in the cache
 *  - for each query, invalidate the output by setting its cached state to undefined
 */
export const invalidateQueriesByDependencyPointer = async ({
  cache,
  pointer,
}: {
  cache: SimpleAsyncCache<SerializableObject>;
  pointer: string;
}): Promise<string[]> => {
  // lookup the current state of the pointer in the cache
  const pointerState = await cache.get(pointer);
  if (!pointerState) return []; // if pointer is not already in cache, nothing depends on it
  if (!isValidPointerState(pointerState))
    throw new UnexpectedCodePathError(
      'detected corrupt $query.ref dependency.pointer state. stale cache data may exist',
      { pointer, pointerState },
    );

  // invalidate the state of each dependent query
  await Promise.all(
    pointerState.queries.map((queryKey) => cache.set(queryKey, undefined)),
  );

  // return the queries invalidated
  return pointerState.queries;
};
