import { getMeta } from '@uql/core/entity/decorator';
import { Query, QueryCriteria, QueryOne, Type } from '@uql/core/type';
import { kebabCase } from '@uql/core/util';
import { RequestOptions, RequestFindOptions, ClientQuerier } from '../type';
import { get, post, patch, remove } from '../http';
import { stringifyQuery } from './query.util';

export class HttpQuerier implements ClientQuerier {
  constructor(readonly basePath: string) {}

  getBasePath<E>(entity: Type<E>) {
    return this.basePath + '/' + kebabCase(entity.name);
  }

  insertOne<E>(entity: Type<E>, body: E, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    return post<any>(basePath, body, opts);
  }

  updateOneById<E>(entity: Type<E>, body: E, id: any, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    return patch<number>(`${basePath}/${id}`, body, opts);
  }

  saveOne<E>(entity: Type<E>, body: E, opts?: RequestOptions) {
    const meta = getMeta(entity);
    const id = body[meta.id.property];
    if (id) {
      return this.updateOneById(entity, body, id, opts).then(() => ({ data: id }));
    }
    return this.insertOne(entity, body, opts);
  }

  findOne<E>(entity: Type<E>, qm: QueryOne<E>, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    const qs = stringifyQuery(qm);
    return get<E>(`${basePath}/one${qs}`, opts);
  }

  findOneById<E>(entity: Type<E>, id: any, qm: QueryOne<E>, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    const qs = stringifyQuery(qm);
    return get<E>(`${basePath}/${id}${qs}`, opts);
  }

  findMany<E>(entity: Type<E>, qm: Query<E>, opts?: RequestFindOptions) {
    const data: typeof qm & Pick<typeof opts, 'count'> = { ...qm };
    if (opts?.count) {
      data.count = true;
    }
    const basePath = this.getBasePath(entity);
    const qs = stringifyQuery(data);
    return get<E[]>(`${basePath}${qs}`, opts);
  }

  deleteMany<E>(entity: Type<E>, qm: QueryCriteria<E>, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    const qs = stringifyQuery(qm);
    return remove<number>(`${basePath}${qs}`, opts);
  }

  deleteOneById<E>(entity: Type<E>, id: any, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    return remove<number>(`${basePath}/${id}`, opts);
  }

  count<E>(entity: Type<E>, qm: QueryCriteria<E>, opts?: RequestOptions) {
    const basePath = this.getBasePath(entity);
    const qs = stringifyQuery(qm);
    return get<number>(`${basePath}/count${qs}`, opts);
  }
}
