import { DomainEntity, DomainLiteral } from 'domain-objects';
import { getCacheReferenceKeyForDomainObject } from 'with-cache-normalization';
import { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import { SimpleAsyncCache } from 'with-simple-cache';

import { getDependencyPointersInvalidatedByMutationOutputReference } from './getDependencyPointersInvalidatedByMutationOutputReference';

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
const container = new Container({
  uuid: '__container.uuid__',
  icid: '__container.icid__',
  manufacturer: 'containers r us',
  onShipUuid: '__container.onshipuuid__',
  insuredCargoUuids: ['__insured.cargo.1__', '__insured.cargo.2__'],
  lock,
});

describe('getDependencyPointersInvalidatedByMutationOutputReference', () => {
  const exampleStore: Record<string, any> = {};
  const cacheGetMock = jest.fn(async (key) => exampleStore[key]);
  const cacheSetMock = jest.fn(
    async (key, value) => (exampleStore[key] = value),
  );
  const cache: SimpleAsyncCache<SerializableObject> = {
    get: cacheGetMock,
    set: cacheSetMock,
  };

  beforeEach(() => jest.clearAllMocks());
  it.only('should invalidate nothing if it is not a domain entity', async () => {
    const pointers =
      await getDependencyPointersInvalidatedByMutationOutputReference({
        cache,
        referenceKey: getCacheReferenceKeyForDomainObject(lock),
        referencedDobj: lock,
      });
    expect(pointers).toEqual([]);
  });
  it('should invalidate all non-metadata properties if the entity is not yet cached', async () => {
    const pointers =
      await getDependencyPointersInvalidatedByMutationOutputReference({
        cache,
        referenceKey: getCacheReferenceKeyForDomainObject(container),
        referencedDobj: container,
      });
    expect(pointers).toEqual([
      '.query.dep.Container.uuid.__container.uuid__.icid',
      '.query.dep.Container.icid.__containericid__.885f378972d5731706f1214eaf2c7227c17163034c03d0f1c93e1fd971079c48',
      '.query.dep.Container.uuid.__container.uuid__.manufacturer',
      '.query.dep.Container.manufacturer.containersrus.953bd78f87bfdefbe9c5745c823c503eb2ea3e64a1cfd388d17bbc422e06a9d6',
      '.query.dep.Container.uuid.__container.uuid__.onShipUuid',
      '.query.dep.Container.onShipUuid.__containeronshipuuid__.a69497504e140a3c7b2244d18039a0bff2143c824bbbbac3fe763881fe3f5af6',
      '.query.dep.Container.uuid.__container.uuid__.insuredCargoUuids',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo1__.97c4311ea52323c110dc41035084a81560edf404337073990f2b9b790c388b7d',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo2__.44d32806d2699a360872669d123a5e813ecb8f3da642d9919bc857a0ec3fe66a',
      '.query.dep.Container.uuid.__container.uuid__.lock',
      '.query.dep.Container.lock.ContainerLock.swipernoswiping.lockymclockface.3cf448f9380ecd4daf668110f1f0bf7884de32b69c3576082bf0dcc1ca50c2b9',
    ]);
  });
  it('should invalidate nothing if none of the updatable properties have changed', async () => {
    // record the current state of the domain object into the cache
    const referenceKey = getCacheReferenceKeyForDomainObject(container);
    await cache.set(referenceKey, container);

    // now prove that no pointers are returned, since nothing changed
    const pointers =
      await getDependencyPointersInvalidatedByMutationOutputReference({
        cache,
        referenceKey,
        referencedDobj: container,
      });
    expect(pointers).toEqual([]);
  });
  it('should invalidate only the changed properties if updatable properties have changed', async () => {
    // record the one state of the domain object into the cache
    const referenceKey = getCacheReferenceKeyForDomainObject(container);
    await cache.set(referenceKey, container);

    // now prove that only pointers for properties that were updated are returned
    const pointers =
      await getDependencyPointersInvalidatedByMutationOutputReference({
        cache,
        referenceKey,
        referencedDobj: new Container({
          ...container,
          onShipUuid: '__new.ship.uuid__',
        }),
      });
    expect(pointers).toEqual([
      '.query.dep.Container.uuid.__container.uuid__.onShipUuid',
      '.query.dep.Container.onShipUuid.__containeronshipuuid__.a69497504e140a3c7b2244d18039a0bff2143c824bbbbac3fe763881fe3f5af6',
      '.query.dep.Container.onShipUuid.__newshipuuid__.9dfb3f21fed950dea2b7fda0562bf18b22cf920dff549e8ee086940723adf53b',
    ]);
  });
  it('should invalidate each value of the array of a changed updatable array property', async () => {
    // record the one state of the domain object into the cache
    const referenceKey = getCacheReferenceKeyForDomainObject(container);
    await cache.set(referenceKey, container);

    // now prove that only pointers for properties that were updated are returned
    const pointers =
      await getDependencyPointersInvalidatedByMutationOutputReference({
        cache,
        referenceKey,
        referencedDobj: new Container({
          ...container,
          insuredCargoUuids: ['__insured.cargo.1__'],
        }),
      });
    expect(pointers).toEqual([
      '.query.dep.Container.uuid.__container.uuid__.insuredCargoUuids',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo1__.97c4311ea52323c110dc41035084a81560edf404337073990f2b9b790c388b7d',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo2__.44d32806d2699a360872669d123a5e813ecb8f3da642d9919bc857a0ec3fe66a',
    ]);
  });
});
