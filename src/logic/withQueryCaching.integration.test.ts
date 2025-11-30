import { DomainEntity, DomainLiteral } from 'domain-objects';
import { getSimpleLambdaClientCacheKey } from 'simple-lambda-client';
import { createCache } from 'simple-on-disk-cache';
import {
  getCacheReferenceKeyForDomainObject,
  withSerialization,
} from 'with-cache-normalization';

import { uuid } from '../deps';
import { ref } from './ref/ref';
import { withMutationEffects } from './withMutationEffects';
import { withQueryCaching } from './withQueryCaching';

interface Ship {
  uuid: string;
  name: string;
  fuelQuantity: number;
}
class Ship extends DomainEntity<Ship> implements Ship {
  public static unique = ['uuid'];
  public static updatable = ['name', 'fuelQuantity'];
}
interface ContainerLock {
  manufacturer: string;
  model: string;
}
class ContainerLock
  extends DomainLiteral<ContainerLock>
  implements ContainerLock {}

interface Container {
  uuid: string;
  onShipUuid: string;
  lock: ContainerLock | null;
}
class Container extends DomainEntity<Container> implements Container {
  public static unique = ['uuid'];
  public static updatable = ['onShipUuid', 'lock'];
}

const getShipOfContainer = async (_: {
  containerUuid: string;
}): Promise<{ ship: Ship }> => {
  const ship = new Ship({
    uuid: uuid(),
    name: '__name__',
    fuelQuantity: 9,
  });
  return { ship };
};
const getContainersOnShip = async ({
  shipUuid,
}: {
  shipUuid: string;
}): Promise<{ containers: Container[] }> => {
  const container = new Container({
    uuid: uuid(),
    onShipUuid: shipUuid,
    lock: null,
  });
  return {
    containers: [container],
  };
};

const cache = createCache({
  directory: { mounted: { path: `${__dirname}/__tmp__` } },
});

describe('withQueryCaching', () => {
  const getShipOfContainerWithCaching = withQueryCaching(getShipOfContainer, {
    cache,
    serialize: {
      key: (event) =>
        getSimpleLambdaClientCacheKey({
          service: 'svc-container-ships',
          function: 'getShipOfContainer',
          stage: 'test',
          event,
        }),
    },
    dependsOn: [
      {
        relationship: {
          from: {
            dobj: ref(Container),
            uuid: ({ input }) => input[0].containerUuid,
          },
          to: { dobj: ref(Ship) },
          via: ref(Container, 'onShipUuid'),
        },
      },
    ],
  });
  const getContainersOnShipWithCaching = withQueryCaching(getContainersOnShip, {
    cache,
    serialize: {
      key: (event) =>
        getSimpleLambdaClientCacheKey({
          service: 'svc-container-ships',
          function: 'getContainersOnShip',
          stage: 'test',
          event,
        }),
    },
    dependsOn: [
      {
        relationship: {
          from: {
            dobj: ref(Ship),
            uuid: ({ input }) => input[0].shipUuid,
          },
          to: { dobj: ref(Container) },
          via: ref(Container, 'onShipUuid'),
        },
      },
    ],
  });
  const updateFuelOfShipWithCaching = withMutationEffects(
    async ({
      shipUuid,
      newFuelQuantity,
    }: {
      shipUuid: string;
      newFuelQuantity: number;
    }) => {
      return {
        ship: new Ship({
          uuid: shipUuid,
          name: '__name__',
          fuelQuantity: newFuelQuantity,
        }),
      };
    },
    { cache },
  );
  const addContainerToShipWithCaching = withMutationEffects(
    async ({
      containerUuid,
      shipUuid,
    }: {
      containerUuid: string;
      shipUuid: string;
    }) => {
      return {
        container: new Container({
          uuid: containerUuid,
          onShipUuid: shipUuid,
          lock: null,
        }),
      };
    },
    { cache },
  );

  describe('feature: cache', () => {
    it('should be able to successfully cache data', async () => {
      // run the query
      const { ship } = await getShipOfContainerWithCaching({
        containerUuid: uuid(),
      });
      expect(ship.uuid).toBeDefined();

      // prove that the dobj was persisted into its own normalized key
      const shipCached = await withSerialization(cache).get(
        getCacheReferenceKeyForDomainObject(new Ship(ship)),
      );
      expect(shipCached).toEqual(ship);
    });
    it('should produce equivalent output on cache.hit as on cache.miss', async () => {
      const containerUuid = uuid();
      // run the cache.miss
      const result1 = await getShipOfContainerWithCaching({
        containerUuid,
      });

      // run the cache.hit
      const result2 = await getShipOfContainerWithCaching({
        containerUuid,
      });

      // check that the result is equal
      expect(result2).toEqual(result1);
    });
  });
  describe('feature: automatic cache updates', () => {
    it('should cache.hit newer state of referenced domain object after a mutation withMutationEffects outputs newer state of it', async () => {
      const containerUuid = uuid();

      // get the result before the mutation
      const resultBefore = await getShipOfContainerWithCaching({
        containerUuid,
      });

      // run the mutation
      await updateFuelOfShipWithCaching({
        shipUuid: resultBefore.ship.uuid,
        newFuelQuantity: 821,
      });

      // get the result after the mutation
      const resultAfter = await getShipOfContainerWithCaching({
        containerUuid,
      });

      // prove that it was a cache.hit and got the updated value automatically
      expect(resultAfter.ship.uuid).toEqual(resultBefore.ship.uuid); // was a cache.hit, since the same ship was returned (the root function generates a random ship uuid each time!)
      expect(resultAfter.ship.fuelQuantity).not.toEqual(
        resultBefore.ship.fuelQuantity, // but this changed, automatically, due to the cache update
      );
      expect(resultAfter.ship.fuelQuantity).toEqual(821); // to the new latest value
    });
  });
  describe('feature: automatic cache invalidations', () => {
    it('should cache.miss upon being invalidated by a mutation withMutationEffects', async () => {
      const shipUuid = uuid();

      // get the result before the mutation
      const resultBefore = await getContainersOnShipWithCaching({
        shipUuid,
      });

      // run the mutation
      await addContainerToShipWithCaching({
        containerUuid: uuid(),
        shipUuid,
      });

      // get the result after the mutation
      const resultAfter = await getContainersOnShipWithCaching({
        shipUuid,
      });

      // prove that it was a cache.hit and got the updated value automatically
      expect(resultAfter).not.toEqual(resultBefore); // was a cache.miss, results totally different
    });
    it('should cache.hit if a mutation withMutationEffects which might have invalidated it did not actually produce any changes to the dependent property', async () => {
      const shipUuid = uuid();

      // get the result before the mutation
      const resultBefore = await getContainersOnShipWithCaching({
        shipUuid,
      });

      // run the mutation
      await addContainerToShipWithCaching({
        containerUuid: resultBefore.containers[0]!.uuid, // same container -> no change
        shipUuid,
      });

      // get the result after the mutation
      const resultAfter = await getContainersOnShipWithCaching({
        shipUuid,
      });

      // prove that it was a cache.hit and got the updated value automatically
      expect(resultAfter).toEqual(resultBefore); // was a cache.hit, exactly the same
    });
  });
});
