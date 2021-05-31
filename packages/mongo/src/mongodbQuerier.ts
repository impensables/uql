import { MongoClient, ClientSession, OptionalId, ObjectId } from 'mongodb';
import { Query, EntityMeta, QueryOne, Type, QueryCriteria } from '@uql/core/type';
import { BaseQuerier } from '@uql/core/querier';
import { getMeta } from '@uql/core/entity/decorator';
import { filterPersistableProperties } from '@uql/core/entity/util';
import { MongoDialect } from './mongoDialect';

export class MongodbQuerier extends BaseQuerier {
  private session: ClientSession;

  constructor(readonly conn: MongoClient, readonly dialect = new MongoDialect()) {
    super();
  }

  async insertMany<E>(entity: Type<E>, bodies: E[]) {
    const persistables = bodies.map((body) => {
      const persistableProperties = filterPersistableProperties(entity, body);
      return persistableProperties.reduce((acc, key) => {
        acc[key] = body[key];
        return acc;
      }, {} as OptionalId<E>);
    });

    const res = await this.collection(entity).insertMany(persistables, { session: this.session });

    return Object.values(res.insertedIds);
  }

  async updateMany<E>(entity: Type<E>, qm: QueryCriteria<E>, body: E) {
    const persistableProperties = filterPersistableProperties(entity, body);
    const persistable = persistableProperties.reduce((acc, key) => {
      acc[key] = body[key];
      return acc;
    }, {} as OptionalId<E>);

    const res = await this.collection(entity).updateMany(
      this.dialect.buildFilter(entity, qm.filter),
      { $set: persistable },
      {
        session: this.session,
      }
    );

    return res.modifiedCount;
  }

  async findMany<E>(entity: Type<E>, qm: Query<E>) {
    const meta = getMeta(entity);

    let documents: E[];

    if (qm.populate && Object.keys(qm.populate).length) {
      const pipeline = this.dialect.buildAggregationPipeline(entity, qm);
      documents = await this.collection(entity).aggregate<E>(pipeline, { session: this.session }).toArray();
      normalizeIds(documents, meta);
      await this.populateToManyRelations(entity, documents, qm.populate);
    } else {
      const cursor = this.collection(entity).find<E>({}, { session: this.session });

      if (qm.filter) {
        const filter = this.dialect.buildFilter(entity, qm.filter);
        cursor.filter(filter);
      }
      if (qm.project) {
        cursor.project(qm.project);
      }
      if (qm.sort) {
        cursor.sort(qm.sort);
      }
      if (qm.skip) {
        cursor.skip(qm.skip);
      }
      if (qm.limit) {
        cursor.limit(qm.limit);
      }

      documents = await cursor.toArray();
      normalizeIds(documents, meta);
    }

    return documents;
  }

  findOneById<E>(entity: Type<E>, id: ObjectId, qo: QueryOne<E>) {
    const meta = getMeta(entity);
    return this.findOne<E>(entity, { ...qo, filter: { [meta.id.name]: id } });
  }

  async deleteMany<E>(entity: Type<E>, qm: QueryCriteria<E>) {
    const res = await this.collection(entity).deleteMany(this.dialect.buildFilter(entity, qm.filter), {
      session: this.session,
    });
    return res.deletedCount;
  }

  count<E>(entity: Type<E>, qm: QueryCriteria<E>) {
    return this.collection(entity).countDocuments(this.dialect.buildFilter(entity, qm.filter), {
      session: this.session,
    });
  }

  get hasOpenTransaction() {
    return this.session?.inTransaction();
  }

  collection<E>(entity: Type<E>) {
    const meta = getMeta(entity);
    return this.conn.db().collection(meta.name);
  }

  async beginTransaction() {
    if (this.session?.inTransaction()) {
      throw new TypeError('pending transaction');
    }
    this.session = this.conn.startSession();
    this.session.startTransaction();
  }

  async commitTransaction() {
    if (!this.session?.inTransaction()) {
      throw new TypeError('not a pending transaction');
    }
    await this.session.commitTransaction();
    this.session.endSession();
  }

  async rollbackTransaction() {
    if (!this.session?.inTransaction()) {
      throw new TypeError('not a pending transaction');
    }
    await this.session.abortTransaction();
  }

  async release() {
    if (this.session?.inTransaction()) {
      throw new TypeError('pending transaction');
    }
    return this.conn.close();
  }
}

export function normalizeIds<E>(docs: E | E[], meta: EntityMeta<E>) {
  if (Array.isArray(docs)) {
    for (const doc of docs) {
      normalizeId<E>(doc, meta);
    }
  } else {
    normalizeId<E>(docs, meta);
  }
}

function normalizeId<E>(doc: E, meta: EntityMeta<E>) {
  if (!doc) {
    return;
  }
  doc[meta.id.property] = (doc as any)._id;
  delete (doc as any)._id;
  for (const relProp of Object.keys(meta.relations)) {
    const relOpts = meta.relations[relProp];
    const relData = doc[relProp];
    if (typeof relData === 'object' && !(relData instanceof ObjectId)) {
      const relMeta = getMeta(relOpts.entity());
      normalizeIds(relData, relMeta);
    }
  }
  return doc as E;
}
