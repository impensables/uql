import {
  Properties,
  Querier,
  Query,
  QueryCriteria,
  QueryOne,
  QueryPopulate,
  Relations,
  Repository,
  Type,
} from '../type';
import { getMeta } from '../entity/decorator';
import { clone, getKeys } from '../util';
import { filterRelations } from '../entity/util';
import { BaseRepository } from './baseRepository';

/**
 * Use a class to be able to detect instances at runtime (via instanceof).
 */
export abstract class BaseQuerier implements Querier {
  abstract count<E>(entity: Type<E>, qm?: QueryCriteria<E>): Promise<number>;

  findOneById<E>(type: Type<E>, id: any, qo: QueryOne<E> = {}) {
    const meta = getMeta(type);
    const idName = meta.properties[meta.id].name;
    return this.findOne(type, { ...qo, $filter: { [idName]: id } });
  }

  async findOne<E>(entity: Type<E>, qm: QueryOne<E>) {
    qm.$limit = 1;
    const rows = await this.findMany(entity, qm);
    return rows[0];
  }

  abstract findMany<E>(entity: Type<E>, qm: Query<E>): Promise<E[]>;

  async insertOne<E>(entity: Type<E>, payload: E) {
    const [id] = await this.insertMany(entity, [payload]);
    return id;
  }

  abstract insertMany<E>(entity: Type<E>, payload: E[]): Promise<any[]>;

  updateOneById<E>(entity: Type<E>, payload: E, id: any) {
    const meta = getMeta(entity);
    return this.updateMany(entity, payload, { $filter: { [meta.id]: id } });
  }

  abstract updateMany<E>(entity: Type<E>, payload: E, qm: QueryCriteria<E>): Promise<number>;

  deleteOneById<E>(entity: Type<E>, id: any) {
    const meta = getMeta(entity);
    return this.deleteMany(entity, { $filter: { [meta.id]: id } });
  }

  abstract deleteMany<E>(entity: Type<E>, qm: QueryCriteria<E>): Promise<number>;

  protected async populateToManyRelations<E>(entity: Type<E>, payload: E[], populate: QueryPopulate<E>) {
    const meta = getMeta(entity);

    for (const relKey in populate) {
      const relOpts = meta.relations[relKey as Relations<E>];

      if (!relOpts) {
        throw new TypeError(`'${entity.name}.${relKey}' is not annotated as a relation`);
      }

      const relEntity = relOpts.entity();
      const relQuery = clone(populate[relKey] as Query<typeof relEntity>);
      const referenceProperty = relOpts.references[0].source;
      const ids = payload.map((it) => it[meta.id]);

      if (relOpts.through) {
        const throughEntity = relOpts.through();
        const throughMeta = getMeta(throughEntity);
        const targetRelKey = getKeys(throughMeta.relations)[relOpts.mappedBy ? 0 : 1];
        const throughFounds = await this.findMany(throughEntity, {
          $project: [referenceProperty],
          $filter: {
            [referenceProperty]: ids,
          },
          $populate: {
            [targetRelKey]: {
              ...relQuery,
              $required: true,
            },
          },
        });
        const founds = throughFounds.map((it) => it[targetRelKey]);
        this.putChildrenInParents(payload, founds, meta.id, referenceProperty, relKey);
      } else if (relOpts.cardinality === '1m') {
        if (relQuery.$project) {
          if (Array.isArray(relQuery.$project)) {
            if (!relQuery.$project.includes(referenceProperty)) {
              relQuery.$project.push(referenceProperty);
            }
          } else if (!relQuery.$project[referenceProperty]) {
            relQuery.$project[referenceProperty] = true;
          }
        }
        relQuery.$filter = { [referenceProperty]: { $in: ids } };
        const founds = await this.findMany(relEntity, relQuery);
        this.putChildrenInParents(payload, founds, meta.id, referenceProperty, relKey);
      }
    }
  }

  protected putChildrenInParents<E>(
    parents: E[],
    children: E[],
    parentIdProperty: string,
    referenceProperty: string,
    relKey: string
  ): void {
    const childrenByParentMap = children.reduce((acc, child) => {
      const parenId = child[referenceProperty];
      if (!acc[parenId]) {
        acc[parenId] = [];
      }
      acc[parenId].push(child);
      return acc;
    }, {});

    for (const parent of parents) {
      const parentId = parent[parentIdProperty];
      parent[relKey] = childrenByParentMap[parentId];
    }
  }

  protected async insertRelations<E>(entity: Type<E>, payload: E[]) {
    const meta = getMeta(entity);
    await Promise.all(
      payload.map((it) => {
        const relKeys = filterRelations(meta, it);
        if (!relKeys.length) {
          return;
        }
        return Promise.all(relKeys.map((relKey) => this.saveRelation(entity, it, relKey)));
      })
    );
  }

  protected async updateRelations<E>(entity: Type<E>, payload: E, criteria: QueryCriteria<E>) {
    const meta = getMeta(entity);
    const relKeys = filterRelations(meta, payload);

    if (!relKeys.length) {
      return;
    }

    const founds = await this.findMany(entity, {
      ...criteria,
      $project: [meta.id] as Properties<E>[],
    });

    const ids = founds.map((found) => found[meta.id]);

    await Promise.all(
      ids.map((id) =>
        Promise.all(relKeys.map((relKey) => this.saveRelation(entity, { ...payload, [meta.id]: id }, relKey, true)))
      )
    );
  }

  protected async deleteRelations<E>(entity: Type<E>, criteria: QueryCriteria<E>): Promise<void> {
    const meta = getMeta(entity);

    // const relKeys = filterPersistableRelationKeys(meta);
    // if (!relKeys.length) {
    //   return;
    // }

    // TODO
    // for (const key of relKeys) {
    // }
  }

  protected async saveMany<E>(entity: Type<E>, payload: E[]): Promise<any[]> {
    const meta = getMeta(entity);
    const inserts: E[] = [];
    const updates: E[] = [];
    const links: any[] = [];

    for (const it of payload) {
      if (it[meta.id]) {
        if (getKeys(it).length === 1) {
          links.push(it[meta.id]);
        } else {
          updates.push(it);
        }
      } else {
        inserts.push(it);
      }
    }

    return Promise.all([
      ...links,
      ...(inserts.length ? await this.insertMany(entity, inserts) : []),
      ...updates.map(async (it) => {
        await this.updateOneById(entity, it, it[meta.id]);
        return it[meta.id];
      }),
    ]);
  }

  protected async saveRelation<E>(
    entity: Type<E>,
    payload: E,
    relKey: Relations<E>,
    isUpdate?: boolean
  ): Promise<void> {
    const meta = getMeta(entity);
    const id = payload[meta.id];
    const { entity: entityGetter, cardinality, references, through } = meta.relations[relKey];
    const relEntity = entityGetter();
    const relPayload = payload[relKey] as any;

    if (cardinality === '1m' || cardinality === 'mm') {
      const refKey = references[0].source;

      if (through) {
        const throughEntity = through();
        await this.deleteMany(throughEntity, { $filter: { [refKey]: id } });
        if (relPayload) {
          const savedIds = await this.saveMany(relEntity, relPayload);
          const throughBodies = savedIds.map((relId) => ({
            [references[0].source]: id,
            [references[1].source]: relId,
          }));
          await this.insertMany(throughEntity, throughBodies);
        }
        return;
      }
      if (isUpdate) {
        await this.deleteMany(relEntity, { $filter: { [refKey]: id } });
      }
      if (relPayload) {
        for (const it of relPayload) {
          it[refKey] = id;
        }
        await this.saveMany(relEntity, relPayload);
      }
      return;
    }

    if (cardinality === '11') {
      const refKey = references[0].target;
      if (relPayload === null) {
        await this.deleteMany(relEntity, { $filter: { [refKey]: id } });
        return;
      }
      await this.saveMany(relEntity, [{ ...relPayload, [refKey]: id }]);
      return;
    }

    if (cardinality === 'm1') {
      const refKey = references[0].source;
      if (payload[refKey]) {
        return;
      }
      if (relPayload) {
        const refId = await this.insertOne(relEntity, relPayload);
        await this.updateOneById(entity, { [refKey]: refId }, id);
      }
      return;
    }
  }

  getRepository<E>(entity: Type<E>): Repository<E> {
    return new BaseRepository(entity, this);
  }

  abstract readonly hasOpenTransaction: boolean;

  abstract beginTransaction(): Promise<void>;

  abstract commitTransaction(): Promise<void>;

  abstract rollbackTransaction(): Promise<void>;

  abstract release(): Promise<void>;
}
