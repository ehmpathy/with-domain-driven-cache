import { DomainEntity, DomainLiteral } from 'domain-objects';
import { SimpleAsyncCache } from 'with-simple-cache';

import { ref } from './ref/ref';
import { withMutationEffects } from './withMutationEffects';
import { withQueryCaching } from './withQueryCaching';

interface Ship {
  uuid: string;
  isid: string; // international ship id
  name: string;
}
class Ship extends DomainEntity<Ship> implements Ship {
  public static unique = ['isid'];
  public static updatable = ['name'];
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
  icid: string; // international container id
  manufacturer: string;
  onShipUuid: string;
  insuredCargoUuids: string[];
  lock: ContainerLock;
}
class Container extends DomainEntity<Container> implements Container {
  public static unique = ['icid'];
  public static updatable = ['onShipUuid', 'insuredCargoUuids', 'lock'];
}

const lock = new ContainerLock({
  manufacturer: 'swiper no swiping',
  model: 'locky mclockface',
});

const getContainerAndShip = async ({
  containerUuid,
  shipUuid,
}: {
  containerUuid: string;
  shipUuid: string;
}) => {
  return {
    container: new Container({
      uuid: containerUuid,
      icid: '__container.icid__',
      manufacturer: 'containers r us',
      onShipUuid: shipUuid,
      insuredCargoUuids: ['__insured.cargo.1__', '__insured.cargo.2__'],
      lock,
    }),
    ship: new Ship({
      uuid: shipUuid,
      isid: '__ship.isid__',
      name: 'boaty mcboatface',
    }),
  };
};

const addContainerToShip = async ({
  containerUuid,
  shipUuid,
}: {
  containerUuid: string;
  shipUuid: string;
}) => getContainerAndShip({ containerUuid, shipUuid });

describe('withMutationEffects', () => {
  const exampleStore: Record<string, any> = {};
  const cacheGetMock = jest.fn(async (key) => exampleStore[key]);
  const cacheSetMock = jest.fn(
    async (key, value) => (exampleStore[key] = value),
  );
  const cache: SimpleAsyncCache<string> = {
    get: cacheGetMock,
    set: cacheSetMock,
  };
  const getContainerAndShipWithCaching = withQueryCaching(addContainerToShip, {
    cache,
    dependsOn: [
      // add a bunch of dependencies -> get a bunch of dependency pointers
      {
        identity: {
          dobj: ref(Container),
          uuid: ({ input }) => input[0].containerUuid,
        },
      },
      {
        relationship: {
          from: {
            dobj: ref(Ship),
            uuid: ({ input }) => input[0].shipUuid,
          },
          to: {
            dobj: ref(Container),
          },
          via: ref(Container, 'onShipUuid'),
        },
      },
      {
        relationship: {
          from: {
            dobj: ref(Container),
            uuid: ({ input }) => input[0].containerUuid,
          },
          to: {
            dobj: 'InsuredCargo',
          },
          via: ref(Container, 'insuredCargoUuids'),
        },
      },
    ],
  });

  const logDebugMock = jest.fn();
  const addContainerToShipWithMutationEffects = withMutationEffects(
    addContainerToShip,
    { cache, logDebug: logDebugMock },
  );

  beforeEach(() => jest.clearAllMocks());
  it('should check for queries to invalidate for all domain objects referenced in outputs', async () => {
    // run the mutation
    await addContainerToShipWithMutationEffects({
      containerUuid: '__container.uuid__',
      shipUuid: '__ship.uuid__',
    });

    // confirm we looked up queries to invalidate for each non-metadata property of the output referenced dobjs
    expect(cacheGetMock).toHaveBeenCalledTimes(17);
    expect(cacheGetMock.mock.calls).toMatchSnapshot(); // save an example
  });

  it('should produce query invalidations for all the domain entities referenced in outputs', async () => {
    const containerUuid = '__container.uuid__';
    const shipUuid = '__ship.uuid__';

    // get the container and ship with caching, to set some dependency pointers into the cache
    await getContainerAndShipWithCaching({
      containerUuid,
      shipUuid,
    });

    // now run the mutation
    await addContainerToShipWithMutationEffects({
      containerUuid,
      shipUuid,
    });

    // confirm we ran invalidations on all of the dependency pointers that existed
    expect(cacheSetMock).toHaveBeenCalledTimes(8);
    expect(cacheSetMock.mock.calls).toMatchSnapshot();
  });
  it('should log the cache.effects if logDebug option was specified', async () => {
    // run the mutation
    await addContainerToShipWithMutationEffects({
      containerUuid: '__container.uuid__',
      shipUuid: '__ship.uuid__',
    });

    // confirm we logged the effects
    expect(logDebugMock).toHaveBeenCalledTimes(1);
    expect(logDebugMock).toHaveBeenCalledWith('ddcache.mutation.effects', {
      updated: { references: expect.any(Array) },
      evaluated: { deps: expect.any(Array) },
      invalidated: { queries: expect.any(Array) },
    });
    expect(logDebugMock.mock.calls).toMatchSnapshot();
  });
});
