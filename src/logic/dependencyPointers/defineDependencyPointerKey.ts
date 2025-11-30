import {
  DomainEntity,
  DomainLiteral,
  getUniqueIdentifierSlug,
} from 'domain-objects';
import { asHashSha256Sync } from 'hash-fns';
import type { PickOne } from 'type-fns';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';

const serializePropertyValue = (value: SerializableObject) => {
  // if it is a domain object, get its unique identifier
  const isDomainIdentifiable =
    value instanceof DomainEntity || value instanceof DomainLiteral;
  if (isDomainIdentifiable) return getUniqueIdentifierSlug(value);

  // otherwise, must use JSON.stringify, to avoid getting things like `[ Object: object ]`; however, must be filePathSafe, so hash and include human part
  const humanPart = JSON.stringify(value)
    .replace(/:/g, '.')
    .replace(/[^\w\-_]/g, '')
    .replace(/\.\./g, '.');
  const uniquePart = asHashSha256Sync(JSON.stringify(value)); // part to guarantee uniqueness
  return [humanPart, uniquePart].join('.');
};

/**
 * defines a dependency pointer key
 *
 * supports both cases
 * - foreignKey specified on source table
 * - foreignKey specified on target table
 */
export const defineDependencyPointerKey = ({
  dobj,
  property,
  specifier,
}: {
  dobj: string;
  property: string;
  specifier: PickOne<{
    /**
     * specifies that the dependency is on *any* value of the property from this *specific* domain object
     */
    propertyOf: { uuid: string };

    /**
     * specifies that the dependency is on this *specific* value of the property from *any* domain object of this class
     */
    propertyEquals: { value: SerializableObject };
  }>;
}): string =>
  `.query.dep.${[
    dobj,
    specifier.propertyOf ? `.uuid.${specifier.propertyOf.uuid}` : '',
    '.',
    property,
    specifier.propertyEquals
      ? `.${serializePropertyValue(specifier.propertyEquals.value)}`
      : '',
  ].join('')}`;
