[![build status](https://travis-ci.org/impensables/uql.svg?branch=master)](https://travis-ci.org/impensables/uql?branch=master)
[![coverage status](https://coveralls.io/repos/impensables/uql/badge.svg?branch=master)](https://coveralls.io/r/impensables/uql?branch=master)
[![npm version](https://badge.fury.io/js/%40uql%2Fcore.svg)](https://badge.fury.io/js/%40uql%2Fcore)

# :sun_with_face: Getting Started

`uql` is a plug & play `ORM`, with a declarative `JSON` syntax to query/update multiple data-sources. Essentially, just declare what you want from the datasource, and then `uql` will run efficient (and safe) `SQL` (or `Mongo`) queries.

Given it is just a small library with serializable `JSON` syntax, the queries can be written in the client (web/mobile) and send to the backend; or just use `uql` directly in the backend; or even use it in a mobile app with an embedded database.

## <a name="features"></a> Features

- `JSON` (serializable) syntax for all the queries.
- uses the power of `TypeScript`, smart type inference everywhere so the queries and models are easier to maintain and more reliable.
- generated queries are fast, safe, and human-readable.
- `project`, `filter`, `sort`, and `pager` at multiple levels. Including deep relations and their fields.
- declarative and programmatic `transactions`.
- `soft-delete`.
- `virtual fields`.
- entity `repositories`.
- different kind of `relations` between entities.
- supports `inheritance` patterns between entities.
- connection pooling.
- supports Postgres, MySQL, MariaDB, SQLite, MongoDB (beta).
- plugins for frameworks: express (more coming).

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Entities](#entities)
4. [Declarative Transactions](#declarative-transactions)
5. [Programmatic Transactions](#programmatic-transactions)
6. [Generate REST APIs with Express](#express)
7. [Consume REST APIs from the Frontend](#client)
8. [FAQs](#faq)

## <a name="installation"></a>:battery: Installation

1.  Install the core package:

    ```sh
    npm install @uql/core --save
    ```

    or

    ```sh
    yarn add @uql/core
    ```

2.  Install one of database packages according to your database:

    - for `MySQL` (or `MariaDB`)

      ```sh
      npm install @uql/mysql --save
      ```

      or with _yarn_

      ```sh
      yarn add @uql/mysql
      ```

    - for `PostgreSQL`

      ```sh
      npm install @uql/postgres --save
      ```

      or with _yarn_

      ```sh
      yarn add @uql/postgres
      ```

    - for `SQLite`

      ```sh
      npm install @uql/sqlite --save
      ```

      or with _yarn_

      ```sh
      yarn add @uql/sqlite
      ```

    - for `MongoDB`

      ```sh
      npm install @uql/mongo --save
      ```

      or with _yarn_

      ```sh
      yarn add @uql/mongo
      ```

3.  Additionally, your `tsconfig.json` needs the following flags:

```json
"target": "es6", // or a more recent ecmascript version
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

## <a name="configuration"></a>:gear: Configuration

Initialization should be done once (e.g. in one of the bootstrap files of your app).

```ts
import { setOptions } from '@uql/core';
import { PgQuerierPool } from '@uql/postgres';

setOptions({
  querierPool: new PgQuerierPool({
    host: 'localhost',
    user: 'theUser',
    password: 'thePassword',
    database: 'theDatabase',
  }),
  logging: true,
  logger: console.log,
});
```

## <a name="entities"></a>:egg: Entities

Take any dump class (aka DTO) and annotate it with the decorators from `'@uql/core/entity'`.

```ts
import { Field, ManyToOne, Id, OneToMany, Entity, OneToOne, ManyToMany } from '@uql/core/entity';

@Entity()
export class Profile {
  /**
   * primary key
   */
  @Id()
  id?: number;
  @Field()
  picture?: string;
  /**
   * foreign-keys are really simple to specify
   */
  @Field({ reference: () => User })
  creatorId?: number;
}

@Entity()
export class User {
  @Id()
  id?: number;
  @Field()
  name?: string;
  @Field()
  email?: string;
  @Field()
  password?: string;
  /**
   * `mappedBy` can be a callback or a string (callback is useful for auto-refactoring)
   */
  @OneToOne({ entity: () => Profile, mappedBy: (profile) => profile.creatorId, cascade: true })
  profile?: Profile;
}

@Entity()
export class MeasureUnitCategory {
  @Id()
  id?: number;
  @Field()
  name?: string;
  @OneToMany({ entity: () => MeasureUnit, mappedBy: (measureUnit) => measureUnit.category })
  measureUnits?: MeasureUnit[];
}

@Entity()
export class MeasureUnit {
  @Id()
  id?: number;
  @Field()
  name?: string;
  @Field({ reference: () => MeasureUnitCategory })
  categoryId?: number;
  @ManyToOne({ cascade: 'persist' })
  category?: MeasureUnitCategory;
}

@Entity()
export class Item {
  @Id()
  id?: number;
  @Field()
  name?: string;
  @Field()
  description?: string;
  @Field()
  code?: string;
  @ManyToMany({ entity: () => Tag, through: () => ItemTag, cascade: true })
  tags?: Tag[];
}

@Entity()
export class Tag {
  @Id()
  id?: number;
  @Field()
  name?: string;
  @ManyToMany({ entity: () => Item, mappedBy: (item) => item.tags })
  items?: Item[];
}

@Entity()
export class ItemTag {
  @Id()
  id?: number;
  @Field({ reference: () => Item })
  itemId?: number;
  @Field({ reference: () => Tag })
  tagId?: number;
}
```

## <a name="declarative-transactions"></a>:speech_balloon: Declarative Transactions

Both, _declarative_ and _programmatic_ transactions are supported, with the former you can just describe the scope of your transactions, with the later you have more flexibility (hence more responsibility).

To use Declarative Transactions (using the `@Transactional` decorator):

1. take any service class, annotate the wanted function with the `@Transactional` decorator.
2. inject the querier instance by decorating one of the function's arguments with `@InjectQuerier`.

```ts
import { Querier } from '@uql/core/type';
import { Transactional, InjectQuerier } from '@uql/core/querier/decorator';

class ConfirmationService {
  @Transactional()
  async confirmAction(confirmation: Confirmation, @InjectQuerier() querier?: Querier) {
    if (confirmation.type === 'register') {
      await querier.insertOne(User, {
        name: confirmation.name,
        email: confirmation.email,
        password: confirmation.password,
      });
    } else {
      await querier.updateOneById(User, confirmation.creatorId, { password: confirmation.password });
    }
    await querier.updateOneById(Confirmation, confirmation.id, { status: CONFIRM_STATUS_VERIFIED });
  }
}

export const confirmationService = new ConfirmationService();

/**
 * then you could just import the constant `confirmationService` in another file,
 * and when you call `confirmAction` function, all the operations there
 * will (automatically) run inside a single transaction
 */
await confirmationService.confirmAction(data);
```

## <a name="programmatic-transactions"></a>:open_hands: Programmatic Transactions

`uql` supports both, _declarative_ and _programmatic_ transactions, with the former you can just describe the scope of your transactions, with the later you have more flexibility (hence more responsibility).

To use Programmatic Transactions:

1. obtain the `querier` object with `await getQuerier()`.
2. open a `try/catch/finally` block.
3. start the transaction with `await querier.beginTransaction()`.
4. perform the different operations using the `querier` or `repositories`.
5. commit the transaction with `await querier.commitTransaction()`.
6. in the `catch` block, add `await querier.rollbackTransaction()`.
7. release the `querier` back to the pool with `await querier.release()` in the `finally` block.

```ts
import { getQuerier } from '@uql/core';

async function confirmAction(confirmation: Confirmation) {
  const querier = await getQuerier();
  try {
    await querier.beginTransaction();
    if (confirmation.action === 'signup') {
      await querier.insertOne(User, {
        name: confirmation.name,
        email: confirmation.email,
        password: confirmation.password,
      });
    } else {
      await querier.updateOneById(User, confirmation.creatorId, { password: confirmation.password });
    }
    await querier.updateOneById(Confirmation, confirmation.id, { status: CONFIRM_STATUS_VERIFIED });
    await querier.commitTransaction();
  } catch (error) {
    await querier.rollbackTransaction();
    throw error;
  } finally {
    await querier.release();
  }
}
```

## <a name="express"></a>:zap: Autogenerate REST APIs with Express

A `express` plugin is provided to automatically generate REST APIs for your entities.

1. Install express plugin in your server project:

```sh
npm install @uql/express --save
```

or with _yarn_

```sh
yarn add @uql/express
```

2. Initialize the `express` middleware in your server code to generate REST APIs for your entities

```ts
import * as express from 'express';
import { querierMiddleware } from '@uql/express';

const app = express();

app
  // ...
  .use(
    '/api',

    // this will generate REST APIs for the entities.
    querierMiddleware({
      // all entities will be automatically exposed unless
      // 'include' or 'exclude' options are provided
      exclude: [Confirmation],

      // `query` callback allows to extend all then queries that are requested to the API,
      // so it is a good place to add additional filters to the queries (like for multi tenant apps)
      query<E>(entity: Type<E>, qm: Query<E>, req: Request): Query<E> {
        qm.$filter = {
          ...qm.$filter,
          // ensure the user can only see the data that belongs to his company
          companyId: req.identity.companyId,
        };
        return qm;
      },
    })
  );
```

## <a name="client"></a>:cloud: Easily call the generated REST APIs from the Client

A client plugin (for browser/mobile) is provided to easily consume the REST APIs from the frontend.

1. Install client plugin in your frontend project:

```sh
npm install @uql/client --save
```

or with _yarn_

```sh
yarn add @uql/client
```

2. Use the client to call the `uql` CRUD API

```ts
import { getRepository } from '@uql/client';

// 'User' is an entity class
const userRepository = getRepository(User);

const users = await userRepository.findMany({
  $project: { email: true, profile: ['picture'] },
  $filter: { email: { $endsWith: '@domain.com' } },
  $sort: { createdAt: -1 },
  $limit: 100,
});
```
