# with-domain-driven-cache

safe 🔭, easy ✨, and powerful ⚡ domain.logic.query cache, via domain.object definitions

# overview

waste time to write cache updates manually on the frontend? got slow queries due to fan out effects on the backend? want to move faster without adhoc code and data stores?

safely and easily add a [dynamodb](https://github.com/ehmpathy/simple-dynamodb-cache), [s3](https://github.com/ehmpathy/simple-on-disk-cache), [localstorage](https://github.com/ehmpathy/simple-localstorage-cache), or any other performant persistance layer backed cache to any domain.logic.query by leverage of the [domain.object](https://github.com/ehmpathy/domain-objects) definitions you already write

features domain driven automation to keep your cache [fresh and clean](https://www.youtube.com/watch?v=-JfEJq56IwI)
- ⚡ intuitive pit-of-success interface
- ✨ automatic cache updates
- ✨ automatic cache invalidations
- 🔭 observable cache operations


# install

```sh
npm install with-domain-driven-cache
```

# use

### ⚡ add a cache to a query

easily add a cache to any domain.logic.query with the wrapper

```ts
import { createCache } from 'simple-dynamodb-cache';
import { withQueryCache } from 'with-domain-driven-cache';

// say you want to cache in dynamodb
const cache = createCache({ table: config.dynamodb.cache });

// say you have this query
const getJobByUuid = async ({ uuid }): Promise<Job> => { /* ... */ }

// add a cache to it easily, like so
const cached = withQueryCache(getJobByUuid, { cache })
```

### ✨ automatically update cache on mutation

if your query outputs domain objects, you've already got automatic cache updates enabled

for example
```ts
// say you have a query with a cache that returns a job by uuid
const getJobByUuid = withQueryCache(async ({ uuid }): Promise<Job> => { /* ... */ }, { cache })

// lets lookup the state of a job we know exists
const jobUuid = '__some_uuid__';
const jobBefore = await getJobByUuid({ uuid: jobUuid }); // cache.miss -> query.output was set to cache
expect(jobBefore.name).toEqual('Junk Removal');

// say you have a mutation which updates the status of a job and returns the new job state
const setJobName = withMutationEffects(async ({ jobUuid, name }): Promise<Job> => { /* ... */ }, { cache });

// lets update the status of our job
await setJobName({ jobUuid, name: 'Hot Tub Removal' }); // cache.update -> updated job.state was set to cache

// now, if you call your cached query, you'll see that it's already been notified of the update!
const jobAfter = await getJobByUuid({ uuid: jobUuid }); // cache.hit -> query.output was fetched from cache
expect(jobAfter.name).toEqual('Hot Tub Removal')
```

this works due to *domain.object dereference*

under the hood, whenever a domain.logic.query.output references a domain.object
- we `.set` the state of the referenced domain.object into its own key in the cache
- we `.set` only a reference pointer to the domain.object into the key for the query
- on `.get` we then look up the domain.object state and replace all of the references with the original value
- that way, every `.set` updates the shared state of the domain.object, which `.get` then gets automatically ✨

### ✨ automatically invalidate cache on mutation

if your domain.logic.query depends on the identities or relationships of domain.objects, you can easily add automatic cache invalidation whenever these dependencies are impacted by a mutation

simply define what your domain.logic.query depends on when you add a cache
```ts
import { refProperty } from 'with-domain-driven-cache';

// say you have this query and a cache to it with the relationship dependency defined
const getJobsByProvider = withQueryCache(
  async ({ providerUuid }): Promise<Job[]> => { /* ... */ },
  {
    cache,
    dependsOn: [
      {
        // this query depends on the relationships
        relationship: {
          // from this provider identified by uuid
          from: {
            dobj: ref(ServiceProvider),
            uuid: ({ input }) => input[0].providerUuid,
          },

          // to any jobs
          to: {
            dobj: ref(Job),
          },

          // they have a relationship with via `Job.providerUuid`
          via: ref(Job, 'providerUuid'),
        }
      }
    ]
  })
```

this tells the cache mechanism that anytime a the relationship between `provider:@uuid` and `job:any` is changed, the query.output should be invalidated

therefore, when the mutation in the following example is called, the query.output is invalidated automatically

for example
```ts
// say you have a mutation which updates the providerUuid of a job
const setJobProvider = withMutationEffects(async ({ jobUuid, providerUuid }): Promise<Job> => { /* ... */ }, { cache });

// lets check the jobs we currently have for our provider
const providerUuid = '__provider_uuid__';
const jobsBefore = await getJobsByProvider({ providerUuid }); // cache.miss -> query.output was set to cache
expect(jobsBefore).toEqual(0); // lets say they have no jobs yet

// lets assign a job to them
await setJobProvider({ jobUuid, providerUuid }); // cache.update -> updated job.state was set to cache

// now, if you call your cached query, you'll see that it's been invalidated and will hit the underlying store again
const jobAfter = await getJobByUuid({ uuid: jobUuid }); // cache.miss -> query.output was set to cache again
expect(jobsBefore).toEqual(1); // now, it would find the new job
```

this works due to domain.logic.query *dependency pointers*

under the hood, whenever a domain.logic.query.dependsOn some domain.object properties
- when the domain.logic.query is executed, the exact properties it depends on are saved in the cache
- when a mutation is ran, the domain.objects it outputs get their properties compared against their cached values
- for each property detected as changed, a cache invalidation is triggered for each query that depends on the property
- that way, as soon as a queries dependencies have been impacted, the query will be invalidated automatically ✨

