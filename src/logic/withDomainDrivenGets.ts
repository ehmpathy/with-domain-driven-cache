import { withoutSet } from 'simple-lambda-client';
import {
  withDenormalization,
  withSerialization,
} from 'with-cache-normalization';
import { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import { SimpleAsyncCache, SimpleCache } from 'with-simple-cache';

/**
 * a method which makes it easy to get from a domain-driven cache, without access to the query logic itself
 *
 * specifically
 * - adds withoutSet to the cache, since only the withQueryCaching wrapped method should be calling that
 * - adds withSerialization to the cache, to make it compatible with normalization
 * - adds withDenormalization to the cache, to enable it to denormalize the normalized cached query outputs
 *
 * usecase
 * - accessing outputs .set by a lambda server, at the lambda client (e.g., with [simple-lambda-client](https://github.com/ehmpathy/simple-lambda-client))
 */
export const withDomainDrivenGets = <T extends SerializableObject>(
  cache: SimpleAsyncCache<string>,
): SimpleCache<T> =>
  withoutSet(withDenormalization(withSerialization<T>(cache)));
