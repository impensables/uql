import { EntityMeta, Querier, Query, QueryFilter, QueryOne, QueryOptions, QueryPopulate } from '../type';
import { getMeta } from '../entity/decorator';

/**
 * Use a class to be able to detect instances at runtime (via instanceof).
 */
export abstract class BaseQuerier<ID = any> implements Querier<ID> {
  abstract insert<E>(entity: { new (): E }, body: E[], opts?: QueryOptions): Promise<ID[]>;

  async insertOne<E>(entity: { new (): E }, body: E, opts?: QueryOptions) {
    const [id] = await this.insert(entity, [body], opts);
    const meta = getMeta(entity);
    await this.insertRelations(entity, { ...body, [meta.id.property]: id });
    return id;
  }

  abstract update<E>(entity: { new (): E }, filter: QueryFilter<E>, body: E): Promise<number>;

  async updateOneById<E>(entity: { new (): E }, id: ID, body: E) {
    const meta = getMeta(entity);
    const affectedRows = await this.update(entity, { [meta.id.property]: id }, body);
    await this.updateRelations(entity, { ...body, [meta.id.property]: id });
    return affectedRows;
  }

  abstract find<E>(entity: { new (): E }, qm: Query<E>, opts?: QueryOptions): Promise<E[]>;

  async findOne<E>(entity: { new (): E }, qm: Query<E>, opts?: QueryOptions) {
    qm.limit = 1;
    const rows = await this.find(entity, qm, opts);
    return rows[0];
  }

  findOneById<E>(type: { new (): E }, id: ID, qo: QueryOne<E> = {}, opts?: QueryOptions) {
    const meta = getMeta(type);
    const key = qo.populate ? `${meta.name}.${meta.id.name}` : meta.id.name;
    return this.findOne(type, { ...qo, filter: { [key]: id } }, opts);
  }

  abstract remove<E>(entity: { new (): E }, filter: QueryFilter<E>): Promise<number>;

  removeOneById<E>(entity: { new (): E }, id: ID) {
    const meta = getMeta(entity);
    return this.remove(entity, { [meta.id.name]: id });
  }

  abstract count<E>(entity: { new (): E }, filter?: QueryFilter<E>): Promise<number>;

  abstract query(query: string): Promise<any>;

  abstract readonly hasOpenTransaction: boolean;

  abstract beginTransaction(): Promise<void>;

  abstract commitTransaction(): Promise<void>;

  abstract rollbackTransaction(): Promise<void>;

  abstract release(): Promise<void>;

  protected async populateToManyRelations<E>(entity: { new (): E }, bodies: E[], populate: QueryPopulate<E>) {
    const meta = getMeta(entity);
    for (const popKey in populate) {
      const relOpts = meta.relations[popKey];
      if (!relOpts) {
        throw new TypeError(`'${entity.name}.${popKey}' is not annotated as a relation`);
      }
      const popVal = populate[popKey];
      const relEntity = relOpts.entity();
      const relQuery = popVal as Query<any>;
      if (relOpts.cardinality === 'oneToMany') {
        const ids = bodies.map((body) => body[meta.id.property]);
        relQuery.filter = { [relOpts.mappedBy]: { $in: ids } };
        const founds = await this.find(relEntity, relQuery);
        const foundsMap = founds.reduce((acc, it) => {
          const attr = it[relOpts.mappedBy];
          if (!acc[attr]) {
            acc[attr] = [];
          }
          acc[attr].push(it);
          return acc;
        }, {});
        for (const body of bodies) {
          body[popKey] = foundsMap[body[meta.id.property]];
        }
      } else if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    }
  }

  protected async insertRelations<E>(entity: { new (): E }, body: E) {
    const meta = getMeta(entity);

    const id = body[meta.id.property];

    const insertProms = filterIndependentRelations(meta, body).map((prop) => {
      const relOpts = meta.relations[prop];
      const relEntity = relOpts.entity();
      if (relOpts.cardinality === 'oneToOne') {
        const relBody: E = { ...body[prop], [relOpts.mappedBy]: id };
        return this.insertOne(relEntity, relBody);
      }
      if (relOpts.cardinality === 'oneToMany') {
        const relBodies: E[] = body[prop].map((it: E) => {
          it[relOpts.mappedBy as string] = id;
          return it;
        });
        return this.insert(relEntity, relBodies);
      }
      if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    });

    await Promise.all<any>(insertProms);
  }

  protected async updateRelations<E>(entity: { new (): E }, body: E) {
    const meta = getMeta(entity);

    const id = body[meta.id.property];

    const removeProms = filterIndependentRelations(meta, body).map(async (prop) => {
      const relOpts = meta.relations[prop];
      const relEntity = relOpts.entity();
      if (relOpts.cardinality === 'oneToOne') {
        const relBody: E = body[prop];
        if (relBody === null) {
          return this.remove(relEntity, { [relOpts.mappedBy]: id });
        }
        return this.update(relEntity, { [relOpts.mappedBy]: id }, relBody);
      }
      if (relOpts.cardinality === 'oneToMany') {
        const relBody: E[] = body[prop];
        await this.remove(relEntity, { [relOpts.mappedBy]: id });
        if (relBody !== null) {
          for (const it of relBody) {
            it[relOpts.mappedBy as string] = id;
          }
          return this.insert(relEntity, relBody);
        }
      }
      if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    });

    await Promise.all(removeProms);
  }
}

function filterIndependentRelations<E>(meta: EntityMeta<E>, body: E) {
  return Object.keys(body).filter((prop) => {
    const relOpts = meta.relations[prop];
    return relOpts && relOpts.cardinality !== 'manyToOne';
  });
}
