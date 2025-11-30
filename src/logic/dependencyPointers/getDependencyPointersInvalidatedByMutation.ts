import { normalizeDomainObjectReferences } from 'with-cache-normalization';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleAsyncCache } from 'with-simple-cache';

import { getDependencyPointersInvalidatedByMutationOutputReference } from './getDependencyPointersInvalidatedByMutationOutputReference';

/**
 * gets all of the dependency pointers which a mutation has invalidated
 */
export const getDependencyPointersInvalidatedByMutation = async ({
  cache,
  output,
}: {
  cache: SimpleAsyncCache<SerializableObject>;
  output: SerializableObject;
}): Promise<string[]> => {
  // extract references to all of the domain objects returned in the output
  const { references } = normalizeDomainObjectReferences({ value: output });

  // define the affected dependency pointers, based on the properties that changed for each referenced domain object
  const pointers = (
    await Promise.all(
      Object.entries(references).map((reference) =>
        getDependencyPointersInvalidatedByMutationOutputReference({
          cache,
          referenceKey: reference[0],
          referencedDobj: reference[1],
        }),
      ),
    )
  ).flat();

  // return the combined pointers
  return [...new Set(pointers)]; // dedupe them before returning
};
