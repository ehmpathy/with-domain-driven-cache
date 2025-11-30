import { DomainEntity } from 'domain-objects';
import { getSimpleLambdaClientCacheKey } from 'simple-lambda-client';
import { SimpleAsyncCache } from 'with-simple-cache';

import { uuid } from '../deps';
import { ref } from './ref/ref';
import { withQueryCaching } from './withQueryCaching';

interface Ship {
  uuid: string;
  isid: string; // international ship id
  name: string;
}
class Ship extends DomainEntity<Ship> implements Ship {
  public static unique = ['isid'];
}

interface Container {
  uuid: string;
  icid: string; // international container id
  onShipUuid: string;
}
class Container extends DomainEntity<Container> implements Container {
  public static unique = ['icid'];
}

const getShipOfContainer = async ({}: {
  containerUuid: string;
}): Promise<{ ship: Ship }> => {
  const ship = new Ship({
    uuid: uuid(),
    isid: uuid(),
    name: '__name__',
  });
  return { ship };
};

describe('withQueryCaching', () => {
  const exampleStore: Record<string, any> = {};
  const cacheGetMock = jest.fn(async (key) => exampleStore[key]);
  const cacheSetMock = jest.fn(
    async (key, value) => (exampleStore[key] = value),
  );
  const cache: SimpleAsyncCache<string> = {
    get: cacheGetMock,
    set: cacheSetMock,
  };

  const logDebugMock = jest.fn();
  const getShipOfContainerWithCaching = withQueryCaching(getShipOfContainer, {
    cache,
    logDebug: logDebugMock,
    dependsOn: [
      {
        relationship: {
          from: {
            dobj: ref(Container),
            uuid: ({ input }) => input[0].containerUuid,
          },
          to: {
            dobj: ref(Ship),
          },
          via: ref(Container, 'onShipUuid'),
        },
      },
    ],
  });

  beforeEach(() => jest.clearAllMocks());
  describe('serialization.key', () => {
    it('should serialize the query input into a key with JSON.parse by default', async () => {
      const containerUuid = uuid();

      // call the method
      await getShipOfContainerWithCaching({
        containerUuid,
      });

      // prove it used the expected key for .get
      const keyExpected = JSON.stringify([{ containerUuid }]);
      expect(cacheGetMock).toHaveBeenCalledWith(keyExpected);

      // prove it used the expected key for .set
      expect(cacheSetMock).toHaveBeenCalledWith(
        keyExpected,
        expect.any(String),
        expect.any(Object),
      );
    });
    it('should serialize the query input into a key with the specified serialization.key method if specified', async () => {
      const containerUuid = uuid();

      // define query with custom key serialization
      const getShipOfContainerWithCachingAndCustomKeySerialization =
        withQueryCaching(getShipOfContainer, {
          cache,
          serialize: {
            key: (input) =>
              getSimpleLambdaClientCacheKey({
                service: 'svc-container-ships',
                function: 'getShipOfContainer',
                stage: 'prod',
                event: input,
              }),
          },
          dependsOn: [], // skip dependsOn def for this test, not relevant
        });

      // call the method
      await getShipOfContainerWithCachingAndCustomKeySerialization({
        containerUuid,
      });

      // prove it used the expected key for .get
      const keyExpected = getSimpleLambdaClientCacheKey({
        service: 'svc-container-ships',
        function: 'getShipOfContainer',
        stage: 'prod',
        event: { containerUuid },
      });
      expect(cacheGetMock).toHaveBeenCalledWith(keyExpected);

      // prove it used the expected key for .set
      expect(cacheSetMock).toHaveBeenCalledWith(
        keyExpected,
        expect.any(String),
        expect.any(Object),
      );
    });
  });
  describe('cache.miss', () => {
    it('should set to the cache with normalization and dependency pointers', async () => {
      await getShipOfContainerWithCaching({
        containerUuid: uuid(),
      });

      // should have called the cache with correct
      expect(cache.get).toHaveBeenCalledTimes(4); // query.output.get.miss, $query.ref.get, query.output.get.hit, $cache.ref.get
      expect(cache.set).toHaveBeenCalledTimes(3); // $query.ref, $cache.ref, query.output
    });
    it('should log the cache.miss and the cache.set if logDebug method was specified', async () => {
      await getShipOfContainerWithCaching({
        containerUuid: uuid(),
      });

      // should have called log debug and reported each step
      expect(logDebugMock).toHaveBeenCalledTimes(2);
      expect(logDebugMock).toHaveBeenCalledWith('ddcache.query.get.miss', {
        key: expect.any(String),
      });
      expect(logDebugMock).toHaveBeenCalledWith('ddcache.query.set', {
        key: expect.any(String),
        deps: expect.any(Array),
      });
    });
  });
  describe('cache.hit', () => {
    it('should get from the cache without calling source logic valid cached entry', async () => {
      const containerUuid = uuid();

      // prove that calling the uncached function gives different uuids each time for same input
      const uncachedResult1 = await getShipOfContainer({ containerUuid });
      const uncachedResult2 = await getShipOfContainer({ containerUuid });
      expect(uncachedResult2).not.toEqual(uncachedResult1);

      // prove that calling the cached function gives the same uuids each time for same input
      const cachedResult1 = await getShipOfContainerWithCaching({
        containerUuid,
      });
      const cachedResult2 = await getShipOfContainerWithCaching({
        containerUuid,
      });
      expect(cachedResult2).toEqual(cachedResult1);
    });
    it('should get the same value as original from cache get', async () => {
      const containerUuid = uuid();
      const cachedResult1 = await getShipOfContainerWithCaching({
        containerUuid,
      });
      const cachedResult2 = await getShipOfContainerWithCaching({
        containerUuid,
      });
      expect(cachedResult2).toEqual(cachedResult1);
    });
    it('should log the cache.hit if logDebug method was specified', async () => {
      const containerUuid = uuid();
      await getShipOfContainerWithCaching({
        containerUuid,
      });
      jest.clearAllMocks();
      await getShipOfContainerWithCaching({
        containerUuid,
      });

      // should have called log debug and reported each step
      expect(logDebugMock).toHaveBeenCalledTimes(1);
      expect(logDebugMock).toHaveBeenCalledWith('ddcache.query.get.hit', {
        key: expect.any(String),
      });
    });
  });
  describe('options', () => {
    it('should respect seconds until expiration', async () => {
      // define method w/ default expiration of 1 second
      const getShipOfContainerWithCachingAndCustomExpiration = withQueryCaching(
        getShipOfContainer,
        {
          cache,
          secondsUntilExpiration: 1,
          dependsOn: [], // skip dependsOn def for this test, not relevant
        },
      );

      // make a cache.miss call
      await getShipOfContainerWithCachingAndCustomExpiration({
        containerUuid: uuid(),
      });

      // prove that it cache.set with the correct seconds until expiration value
      expect(cacheSetMock).toHaveBeenCalledTimes(2); // once for the normalized state, once for the query output
      expect(cacheSetMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { secondsUntilExpiration: 1 },
      );
    });
    it('should skip cache.set if output was marked invalid', async () => {
      // define method w/ invalidation option
      const getShipOfContainerWithCachingAndCustomValidity = withQueryCaching(
        getShipOfContainer,
        {
          cache,
          valid: ({ input }) => input[0].containerUuid === '__valid_uuid__', // mark all as invalid unless for a specific uuid
          dependsOn: [], // skip dependsOn def for this test, not relevant
        },
      );

      // prove that it did not set to cache for rando uuid
      await getShipOfContainerWithCachingAndCustomValidity({
        containerUuid: uuid(),
      });
      expect(cacheSetMock).toHaveBeenCalledTimes(0);

      // prove that it did  set to cache for the specific input we said was valid
      await getShipOfContainerWithCachingAndCustomValidity({
        containerUuid: '__valid_uuid__',
      });
      expect(cacheSetMock).toHaveBeenCalledTimes(2);
    });
  });
});
