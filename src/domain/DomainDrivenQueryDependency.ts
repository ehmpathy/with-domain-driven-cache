import type { PickOne } from 'type-fns';

/**
 * defines a dependency of a domain.logic.query
 *
 * note
 * - these dependencies specify which mutations will cause cache invalidations on this query
 */
export type DomainDrivenQueryDependency<I extends any[], O> = PickOne<{
  /**
   * an identity that this domain.logic.query depends on
   *
   * usecases
   * - invalidate the cache when an entity is created with this identity
   */
  identity: {
    /**
     * the domain.object class name which the query depends on
     */
    dobj: string;

    /**
     * the identit(ies) of the exact domain.object this query depends on
     */
    uuid: (args: { input: I; output: O }) => string | string[];
  };

  /**
   * a relationship between domain.objects that the domain.logic.query depends on
   *
   * usecase
   * - invalidate the query when a relationship `from.dobj:@uuid` -> `to.dobj:any` is added or removed
   */
  relationship: {
    /**
     * the domain.object from which the query accesses the relationship
     */
    from: {
      /**
       * the domain.object class from which the query accesses the relationship
       */
      dobj: string;

      /**
       * the identit(ies) of the domain.object instances from which the query accesses the relationship
       */
      uuid: (args: { input: I; output: O }) => string | string[];
    };

    /**
     * the domain.object to which the query gets access via the relationship
     */
    to: {
      /**
       * the domain.object class to which the query gets access via the relationship
       */
      dobj: string;
    };

    /**
     * the domain.object.property via which the relationship is defined
     *
     * note
     * - this is the property that will be monitored to when the `from.uuid` that this relationship connects gets a new relationship or removes an existing one
     */
    via: {
      /**
       * the domain.object which persists the relationship
       */
      dobj: string;

      /**
       * the property which identifies the related uuid
       */
      prop: string;
    };
  };
}>;
