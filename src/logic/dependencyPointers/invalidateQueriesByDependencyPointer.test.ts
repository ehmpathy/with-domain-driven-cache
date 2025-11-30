import { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import { SimpleAsyncCache } from 'with-simple-cache';

import { sleep } from '../../utils/sleep';
import { invalidateQueriesByDependencyPointer } from './invalidateQueriesByDependencyPointer';

describe('invalidateQueriesByDependencyPointer', () => {
  beforeEach(() => jest.clearAllMocks());

  const exampleStore: Record<string, any> = {};
  const cacheGetMock = jest.fn(async (key) => {
    await sleep(10); // mimic some delay in interacting with the cache, to enable proving concurrency bottleneck effects
    return exampleStore[key];
  });
  const cacheSetMock = jest.fn(async (key, value) => {
    await sleep(10); // mimic some delay in interacting with the cache, to enable proving concurrency bottleneck effects
    exampleStore[key] = value;
  });
  const cache: SimpleAsyncCache<SerializableObject> = {
    get: cacheGetMock,
    set: cacheSetMock,
  };

  it('should have invalidated every query marked as a dependency of the pointer in state', async () => {
    const pointer = '__pointer__';

    // set to state three queries that are a dependency of it
    await cache.set(pointer, {
      queries: ['__query.1__', '__query.2__', '__query.3__'],
    });
    jest.clearAllMocks();

    // invalidate the queries
    await invalidateQueriesByDependencyPointer({ cache, pointer });

    // check that it invalidated each query
    expect(cache.set).toHaveBeenCalledTimes(3);
    expect(cache.set).toHaveBeenCalledWith('__query.1__', undefined);
    expect(cache.set).toHaveBeenCalledWith('__query.2__', undefined);
    expect(cache.set).toHaveBeenCalledWith('__query.3__', undefined);
  });
});
