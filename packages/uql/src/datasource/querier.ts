import { getEntityMeta } from 'uql/decorator';
import { EntityMeta, QuerierContract, Query, QueryFilter, QueryOne, QueryOptions, QueryPopulate } from 'uql/type';

/**
 * Use a class to be able to detect instances at runtime (via instanceof).
 */
export abstract class Querier<ID = any> implements QuerierContract<ID> {
  abstract insert<T>(type: { new (): T }, body: T[], opts?: QueryOptions): Promise<ID[]>;

  async insertOne<T>(type: { new (): T }, body: T, opts?: QueryOptions) {
    const [id] = await this.insert(type, [body], opts);
    const meta = getEntityMeta(type);
    await this.insertRelations(type, { ...body, [meta.id.property]: id });
    return id;
  }

  abstract update<T>(type: { new (): T }, filter: QueryFilter<T>, body: T): Promise<number>;

  async updateOneById<T>(type: { new (): T }, id: ID, body: T) {
    const meta = getEntityMeta(type);
    const affectedRows = await this.update(type, { [meta.id.property]: id }, body);
    await this.updateRelations(type, { ...body, [meta.id.property]: id });
    return affectedRows;
  }

  abstract find<T>(type: { new (): T }, qm: Query<T>, opts?: QueryOptions): Promise<T[]>;

  async findOne<T>(type: { new (): T }, qm: Query<T>, opts?: QueryOptions) {
    qm.limit = 1;
    const rows = await this.find(type, qm, opts);
    return rows ? rows[0] : undefined;
  }

  findOneById<T>(type: { new (): T }, id: ID, qo: QueryOne<T>, opts?: QueryOptions) {
    const meta = getEntityMeta(type);
    return this.findOne(type, { ...qo, filter: { [meta.id.property]: id } }, opts);
  }

  abstract remove<T>(type: { new (): T }, filter: QueryFilter<T>): Promise<number>;

  removeOneById<T>(type: { new (): T }, id: ID) {
    const meta = getEntityMeta(type);
    return this.remove(type, { [meta.id.property]: id });
  }

  abstract count<T>(type: { new (): T }, filter?: QueryFilter<T>): Promise<number>;

  abstract query(query: string): Promise<any>;

  abstract readonly hasOpenTransaction: boolean;

  abstract beginTransaction(): Promise<void>;

  abstract commitTransaction(): Promise<void>;

  abstract rollbackTransaction(): Promise<void>;

  abstract release(): Promise<void>;

  protected async populateToManyRelations<T>(type: { new (): T }, bodies: T[], populate: QueryPopulate<T>) {
    const meta = getEntityMeta(type);
    for (const popKey in populate) {
      const relOpts = meta.relations[popKey];
      if (!relOpts) {
        throw new TypeError(`'${type.name}.${popKey}' is not annotated as a relation`);
      }
      const popVal = populate[popKey];
      const relType = relOpts.type();
      // const relMeta = getEntityMeta(relType);
      const relQuery = popVal as Query<any>;
      if (relOpts.cardinality === 'oneToMany') {
        const ids = bodies.map((body) => body[meta.id.property]);
        relQuery.filter = { [relOpts.mappedBy]: { $in: ids } };
        const founds = await this.find(relType, relQuery);
        const foundsMap = founds.reduce((acc, it) => {
          const attr = it[relOpts.mappedBy];
          if (!acc[attr]) {
            acc[attr] = [];
          }
          acc[attr].push(it);
          return acc;
        }, {});
        bodies.forEach((body) => {
          body[popKey] = foundsMap[body[meta.id.property]];
        });
      } else if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    }
  }

  private async insertRelations<T>(type: { new (): T }, body: T) {
    const meta = getEntityMeta(type);

    const id = body[meta.id.property];

    const insertProms = this.filterIndependentRelations(meta, body).map((prop) => {
      const relOpts = meta.relations[prop];
      const relType = relOpts.type();
      if (relOpts.cardinality === 'oneToOne') {
        const relBody: T = body[prop];
        return this.insertOne(relType, relBody);
      }
      if (relOpts.cardinality === 'oneToMany') {
        const relBody: T[] = body[prop];
        relBody.forEach((it: T) => {
          it[relOpts.mappedBy] = id;
        });
        return this.insert(relType, relBody);
      }
      if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    });

    await Promise.all<any>(insertProms);
  }

  private async updateRelations<T>(type: { new (): T }, body: T) {
    const meta = getEntityMeta(type);

    const id = body[meta.id.property];

    const removeProms = this.filterIndependentRelations(meta, body).map(async (prop) => {
      const relOpts = meta.relations[prop];
      const relType = relOpts.type();
      if (relOpts.cardinality === 'oneToOne') {
        const relBody: T = body[prop];
        if (relBody === null) {
          return this.remove(relType, { [relOpts.mappedBy]: id });
        }
        return this.update(relType, { [relOpts.mappedBy]: id }, relBody);
      }
      if (relOpts.cardinality === 'oneToMany') {
        const relBody: T[] = body[prop];
        await this.remove(relType, { [relOpts.mappedBy]: id });
        if (relBody !== null) {
          relBody.forEach((it: T) => {
            it[relOpts.mappedBy] = id;
          });
          return this.insert(relType, relBody);
        }
      }
      if (relOpts.cardinality === 'manyToMany') {
        // TODO manyToMany cardinality
        throw new TypeError(`unsupported cardinality ${relOpts.cardinality}`);
      }
    });

    await Promise.all(removeProms);
  }

  private filterIndependentRelations<T>(meta: EntityMeta<T>, body: T) {
    return Object.keys(body).filter((prop) => {
      const relOpts = meta.relations[prop];
      return relOpts && relOpts.cardinality !== 'manyToOne';
    });
  }
}
