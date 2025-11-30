import {
  DomainEntity,
  type DomainObject,
  getUpdatableProperties,
  omitMetadataValues,
  serialize,
} from 'domain-objects';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleAsyncCache } from 'with-simple-cache';

import { defineDependencyPointerKey } from './defineDependencyPointerKey';

export class UndefinableDomainEntityPropertyDependencyInvalidationError extends Error {
  constructor({
    referenceKey,
    referencedDobj,
  }: {
    referenceKey: string;
    referencedDobj: DomainObject<any>;
  }) {
    super(
      `
Mutation output referenced a DomainEntity, ${
        referencedDobj.constructor.name
      }, which did not have a uuid defined. Uuids are required to identify the exact queries that need to be invalidated based on mutation outputs.

Please ensure that all domain entities returned in mutation outputs have uuids defined.

${JSON.stringify(
  {
    referenceKey,
    referencedDobj,
  },
  null,
  2,
)}
  `.trim(),
    );
  }
}

/**
 * tactic: get the dependency pointers invalidated by a mutation output reference to a domain object
 * strategy:
 * - lookup cached state of that dobj from the cache
 * - determine each updatable property that changed between referenced state now and the prior state in the cache
 * - define each property that changed as an invalidated dependency pointer
 *   - treat "does not exist in cache" as "all properties changed"
 *   - treat array properties by creating a dependency pointer for each value
 *   - treat nested object properties at root depth only, serialize them for comparisons
 */
export const getDependencyPointersInvalidatedByMutationOutputReference =
  async ({
    cache,
    referenceKey,
    referencedDobj: dobjReferenced,
  }: {
    cache: SimpleAsyncCache<SerializableObject>;
    referenceKey: string;
    referencedDobj: SerializableObject;
  }): Promise<string[]> => {
    // if the referenced dobj is not a domain entity, then it wont have any updatable properties, do nothing
    if (!(dobjReferenced instanceof DomainEntity)) return [];

    // lookup the state of the dobj in the cache
    const dobjCached: Record<string, SerializableObject> | undefined =
      (await cache.get(referenceKey)) as any;

    // determine all of the updatable properties of the dobj
    const dobjPropertiesUpdatable = Object.keys(
      getUpdatableProperties(dobjReferenced),
    );

    // for each property that is updatable, check whether it has changed
    const dobjPropertiesImpacted = !dobjCached
      ? Object.keys(omitMetadataValues(dobjReferenced)) // if the dobj is not yet cached, emit all of its non-metadata properties (ie., a non-updatable relationship may be established)
      : dobjPropertiesUpdatable.filter(
          // if the dobj is already cached, then emit only the updated properties
          (key) =>
            serialize(dobjCached[key]) !==
            serialize((dobjReferenced as Record<string, any>)[key] as any),
        );

    // for each property that was updated, define dependency pointers for it (both one from the entity + one to the value)
    const pointers = dobjPropertiesImpacted.flatMap((propertyKey) => {
      // define the pointer based on the entity identity
      if (!('uuid' in dobjReferenced))
        throw new UndefinableDomainEntityPropertyDependencyInvalidationError({
          referenceKey,
          referencedDobj: dobjReferenced,
        });
      const fromIdentityPointer = defineDependencyPointerKey({
        dobj: dobjReferenced.constructor.name,
        property: propertyKey,
        specifier: { propertyOf: { uuid: dobjReferenced.uuid as string } },
      });

      // define the pointer based on the old property value
      const propertyValueOld = dobjCached?.[propertyKey];
      const propertyValueOldArray = propertyValueOld
        ? Array.isArray(propertyValueOld)
          ? propertyValueOld
          : [propertyValueOld]
        : [];
      const propertyValueNew = (
        dobjReferenced as Record<string, SerializableObject>
      )[propertyKey];
      const propertyValueNewArray = Array.isArray(propertyValueNew)
        ? propertyValueNew
        : [propertyValueNew];
      const propertyValueMergedArray: SerializableObject[] = [
        ...propertyValueOldArray,
        ...propertyValueNewArray,
      ];
      const toValuePointers = propertyValueMergedArray.map((thisValue) =>
        defineDependencyPointerKey({
          dobj: dobjReferenced.constructor.name,
          property: propertyKey,
          specifier: {
            propertyEquals: { value: thisValue },
          },
        }),
      );

      // return all of the pointers
      return [fromIdentityPointer, ...toValuePointers];
    });

    // return all of the pointers affected
    return [...new Set(pointers)]; // dedupe them before returning
  };
