import { UnexpectedCodePathError } from '@ehmpathy/error-fns';
import {
  normalizeDomainObjectReferences,
  withNormalization,
  withSerialization,
} from 'with-cache-normalization';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleAsyncCache } from 'with-simple-cache';

import { sleep } from '../../utils/sleep';
import {
  addQueryKeyToDependencyPointer,
  isValidPointerState,
} from './addQueryKeyToDependencyPointer';

describe('addQueryKeyToDependencyPointer', () => {
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

  it('should correctly set initial state for a new pointer', async () => {
    const pointer = '.query.ref.__pointer.1.__';
    const queryKey = 'query.1';
    await addQueryKeyToDependencyPointer({
      cache,
      pointer,
      queryKey,
    });
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledWith(
      pointer,
      { queries: [queryKey] },
      { expiration: { seconds: Infinity } },
    );
  });
  it('should correctly set updated state for an existing pointer', async () => {
    const pointer = '.query.ref.__pointer.3.__';
    await addQueryKeyToDependencyPointer({
      cache,
      pointer,
      queryKey: 'query.1',
    });
    await addQueryKeyToDependencyPointer({
      cache,
      pointer,
      queryKey: 'query.2',
    });
    expect(cacheSetMock).toHaveBeenCalledTimes(2);
    expect(cacheSetMock).toHaveBeenCalledWith(
      pointer,
      { queries: ['query.1'] },
      { expiration: { seconds: Infinity } },
    );
    expect(cacheSetMock).toHaveBeenCalledWith(
      pointer,
      { queries: ['query.1', 'query.2'] },
      { expiration: { seconds: Infinity } },
    );
  });
  it('should not set duplicate query reference for a repeat query<->pointer relationship', async () => {
    const pointer = '.query.ref.__pointer.5.__';
    const queryKey = 'query.1';
    await addQueryKeyToDependencyPointer({
      cache,
      pointer,
      queryKey,
    });
    await addQueryKeyToDependencyPointer({
      cache,
      pointer,
      queryKey,
    });
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledWith(
      pointer,
      { queries: [queryKey] },
      { expiration: { seconds: Infinity } },
    );
  });
  it('should not loose information when concurrent writes are requested', async () => {
    const pointer = '.query.ref.__pointer.7.__';
    const numbersFrom0To99 = [...Array(100).keys()]; // https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
    await Promise.all(
      numbersFrom0To99.map((number) =>
        addQueryKeyToDependencyPointer({
          cache,
          pointer,
          queryKey: `__query.${number}__`,
        }),
      ),
    );
    expect(cacheSetMock).toHaveBeenCalledTimes(100);

    // check that all of the items are present, no parallel write conflicts
    const found = await cache.get(pointer);
    if (!isValidPointerState(found))
      throw new UnexpectedCodePathError('should have set valid state');
    expect(found.queries.length).toEqual(100);
  });
  it('should serialize and normalize well', async () => {
    const cacheWithSerialization: SimpleAsyncCache<SerializableObject> =
      withNormalization(
        withSerialization<SerializableObject>({
          get: cacheGetMock,
          set: cacheSetMock,
        }),
        { normalize: normalizeDomainObjectReferences },
      );
    const pointer = '.query.ref.__pointer.11.__';
    const queryKey = 'query.1';
    await addQueryKeyToDependencyPointer({
      cache: cacheWithSerialization,
      pointer,
      queryKey,
    });
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledWith(
      pointer,
      JSON.stringify({ queries: [queryKey] }),
      { expiration: { seconds: Infinity } },
    );
  });
});
