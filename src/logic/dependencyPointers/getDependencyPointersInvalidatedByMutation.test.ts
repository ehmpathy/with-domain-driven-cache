import { DomainEntity, DomainLiteral } from 'domain-objects';
import type { SerializableObject } from 'with-cache-normalization/dist/domain/NormalizeCacheValueMethod';
import type { SimpleAsyncCache } from 'with-simple-cache';

import { getDependencyPointersInvalidatedByMutation } from './getDependencyPointersInvalidatedByMutation';

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
  onShipUuid: string;
  insuredCargoUuids: string[];
  lock: ContainerLock;
}
class Container extends DomainEntity<Container> implements Container {
  public static unique = ['icid'];
  public static updatable = ['onShipUuid', 'insuredCargoUuids', 'lock'];
}

const ship = new Ship({
  uuid: '__ship.uuid__',
  isid: '__ship.isid__',
  name: 'boaty mcboatface',
});
const lock = new ContainerLock({
  manufacturer: 'swiper no swiping',
  model: 'locky mclockface',
});
const container = new Container({
  uuid: '__container.uuid__',
  icid: '__container.icid__',
  onShipUuid: '__container.onshipuuid__',
  insuredCargoUuids: ['__insured.cargo.1__', '__insured.cargo.2__'],
  lock,
});

describe('getDependencyPointersInvalidatedByMutation', () => {
  const exampleStore: Record<string, any> = {};
  const cacheGetMock = jest.fn(async (key) => exampleStore[key]);
  const cacheSetMock = jest.fn(async (key, value) => {
    exampleStore[key] = value;
  });
  const cache: SimpleAsyncCache<SerializableObject> = {
    get: cacheGetMock,
    set: cacheSetMock,
  };

  it('should be able to get dependency pointers for all entities referenced in the output of a mutation', async () => {
    const pointers = await getDependencyPointersInvalidatedByMutation({
      cache,
      output: {
        container,
        ship,
        lock,
        in: {
          container,
        },
        with: [ship],
      },
    });
    expect(pointers).toEqual([
      '.query.dep.Container.uuid.__container.uuid__.icid',
      '.query.dep.Container.icid.__containericid__.885f378972d5731706f1214eaf2c7227c17163034c03d0f1c93e1fd971079c48',
      '.query.dep.Container.uuid.__container.uuid__.onShipUuid',
      '.query.dep.Container.onShipUuid.__containeronshipuuid__.a69497504e140a3c7b2244d18039a0bff2143c824bbbbac3fe763881fe3f5af6',
      '.query.dep.Container.uuid.__container.uuid__.insuredCargoUuids',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo1__.97c4311ea52323c110dc41035084a81560edf404337073990f2b9b790c388b7d',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo2__.44d32806d2699a360872669d123a5e813ecb8f3da642d9919bc857a0ec3fe66a',
      '.query.dep.Container.uuid.__container.uuid__.lock',
      '.query.dep.Container.lock.ContainerLock.swipernoswiping.lockymclockface.3cf448f9380ecd4daf668110f1f0bf7884de32b69c3576082bf0dcc1ca50c2b9',
      '.query.dep.Ship.uuid.__ship.uuid__.isid',
      '.query.dep.Ship.isid.__shipisid__.f905828ea72c78c5a27e62d09d6a7db443ba838326e8d24ad43766655561e500',
      '.query.dep.Ship.uuid.__ship.uuid__.name',
      '.query.dep.Ship.name.boatymcboatface.ade929700486ec399d87267309e214546b88038e99cd625adcdaba49ad5470bf',
    ]);
  });
  it('should be able to get dependency pointers for all entities referenced in deeply nested and duplicated spots in the output of a mutation', async () => {
    const pointers = await getDependencyPointersInvalidatedByMutation({
      cache,
      output: {
        in: {
          container,
        },
        with: [ship, { lock }],
        over: { under: { again: [lock, { container }, ship] } },
      },
    });
    expect(pointers).toEqual([
      '.query.dep.Container.uuid.__container.uuid__.icid',
      '.query.dep.Container.icid.__containericid__.885f378972d5731706f1214eaf2c7227c17163034c03d0f1c93e1fd971079c48',
      '.query.dep.Container.uuid.__container.uuid__.onShipUuid',
      '.query.dep.Container.onShipUuid.__containeronshipuuid__.a69497504e140a3c7b2244d18039a0bff2143c824bbbbac3fe763881fe3f5af6',
      '.query.dep.Container.uuid.__container.uuid__.insuredCargoUuids',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo1__.97c4311ea52323c110dc41035084a81560edf404337073990f2b9b790c388b7d',
      '.query.dep.Container.insuredCargoUuids.__insuredcargo2__.44d32806d2699a360872669d123a5e813ecb8f3da642d9919bc857a0ec3fe66a',
      '.query.dep.Container.uuid.__container.uuid__.lock',
      '.query.dep.Container.lock.ContainerLock.swipernoswiping.lockymclockface.3cf448f9380ecd4daf668110f1f0bf7884de32b69c3576082bf0dcc1ca50c2b9',
      '.query.dep.Ship.uuid.__ship.uuid__.isid',
      '.query.dep.Ship.isid.__shipisid__.f905828ea72c78c5a27e62d09d6a7db443ba838326e8d24ad43766655561e500',
      '.query.dep.Ship.uuid.__ship.uuid__.name',
      '.query.dep.Ship.name.boatymcboatface.ade929700486ec399d87267309e214546b88038e99cd625adcdaba49ad5470bf',
    ]);
  });
});
