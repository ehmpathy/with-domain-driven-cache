import type { DomainDrivenQueryDependency } from './DomainDrivenQueryDependency';

/**
 * defines all of the dependencies of a domain.logic.query
 *
 * note
 * - these dependencies specify which mutations will cause cache invalidations on this query
 */
export type DomainDrivenQueryDependsOn<I extends any[], O> =
  | DomainDrivenQueryDependency<I, O>[]
  | ((args: { input: I; output: O }) => DomainDrivenQueryDependency<I, O>[]);
