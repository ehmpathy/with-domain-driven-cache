import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import { isPropertyNameAReferenceIntuitively } from 'domain-objects';
import { isAFunction } from 'type-fns';

import type { DomainDrivenQueryDependency } from '../../domain/DomainDrivenQueryDependency';
import type { DomainDrivenQueryDependsOn } from '../../domain/DomainDrivenQueryDependsOn';
import { defineDependencyPointerKey } from './defineDependencyPointerKey';

export class DependencyRelationshipViaUnintuitivePropertyNameError extends Error {
  constructor({
    relationship,
    referencedDobj,
  }: {
    relationship: Required<
      DomainDrivenQueryDependency<any, any>
    >['relationship'];
    referencedDobj: string;
  }) {
    super(
      `
Detected a query.dependsOn.relationship via a property who's name does not intuitively reference the related domain.object

${JSON.stringify(
  {
    relationship: {
      between: [relationship.from.dobj, relationship.to.dobj],
      via: [relationship.via.dobj, relationship.via.prop],
    },
    references: referencedDobj,
    intuitively: false,
  },
  null,
  2,
)}
  `.trim(),
    );
  }
}

/**
 * gets all of the dependency pointers which a query depends on
 *
 * constraints
 * - each pointer must be determinable from mutation output
 * - must support "relationship" dependency
 * - must support "identity" dependency
 */
export const getDependencyPointersDependedOnByQuery = <I extends any[], O>({
  dependsOn: dependsOnArrayOrFunction,
  execution,
}: {
  dependsOn: DomainDrivenQueryDependsOn<I, O>;
  execution: {
    input: I;
    output: O;
  };
}): string[] => {
  // evaluate the dependson function, if was a function
  const dependsOn = isAFunction(dependsOnArrayOrFunction)
    ? dependsOnArrayOrFunction(execution)
    : dependsOnArrayOrFunction;

  // for each dependency, define the pointers
  const pointers = dependsOn.flatMap((dependency) => {
    // handle identity dependency
    if (dependency.identity) {
      const uuidsOrUuid = dependency.identity.uuid(execution);
      const uuids = Array.isArray(uuidsOrUuid) ? uuidsOrUuid : [uuidsOrUuid];
      return uuids.map((uuid) =>
        defineDependencyPointerKey({
          dobj: dependency.identity.dobj,
          property: 'uuid',
          specifier: { propertyEquals: { value: uuid } },
        }),
      );
    }

    // handle relationship dependency
    if (dependency.relationship) {
      // define the uuid(s) that we're establishing relationship from
      const uuidsOrUuid = dependency.relationship.from.uuid(execution);
      const uuids = Array.isArray(uuidsOrUuid) ? uuidsOrUuid : [uuidsOrUuid];

      // determine if the relationship is defined via the source table or target table
      const viaSourceDobj =
        dependency.relationship.via.dobj === dependency.relationship.from.dobj;

      // sanity check that the property the relationship is defined via is named in a way that makes sense (fail fast for illogical reference names)
      const referencedDobj = viaSourceDobj
        ? dependency.relationship.to.dobj // if the relationship is on source dobj, then the referenced one is the target dobj
        : dependency.relationship.from.dobj; // otherwise, the referenced one must be the source dobj
      const isAnIntuitiveReference = isPropertyNameAReferenceIntuitively({
        propertyName: dependency.relationship.via.prop,
        domainObjectName: referencedDobj,
      });
      if (!isAnIntuitiveReference)
        throw new DependencyRelationshipViaUnintuitivePropertyNameError({
          relationship: dependency.relationship,
          referencedDobj,
        });

      // define the dependency pointers for each uuid
      return uuids.map((uuid) =>
        defineDependencyPointerKey({
          dobj: dependency.relationship.via.dobj,
          property: dependency.relationship.via.prop,
          specifier: viaSourceDobj
            ? { propertyOf: { uuid } }
            : { propertyEquals: { value: uuid } },
        }),
      );
    }

    // throw error if unsupported
    throw new UnexpectedCodePathError('unsupported dependency specified');
  });

  // return the pointers
  return pointers;
};
