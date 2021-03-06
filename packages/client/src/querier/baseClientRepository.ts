import { FieldValue, Query, QueryCriteria, QueryOne, QueryOptions, QuerySearch, Type } from '@uql/core/type';
import { ClientQuerier, ClientRepository, RequestOptions } from '../type';

export class BaseClientRepository<E> implements ClientRepository<E> {
  constructor(readonly entity: Type<E>, readonly querier: ClientQuerier) {}

  count(qm: QuerySearch<E>, opts?: RequestOptions) {
    return this.querier.count(this.entity, qm, opts);
  }

  findOneById(id: FieldValue<E>, qm?: QueryOne<E>, opts?: RequestOptions) {
    return this.querier.findOneById(this.entity, id, qm, opts);
  }

  findOne(qm: Query<E>, opts?: RequestOptions) {
    return this.querier.findOne(this.entity, qm, opts);
  }

  findMany(qm: Query<E>, opts?: RequestOptions) {
    return this.querier.findMany(this.entity, qm, opts);
  }

  findManyAndCount(qm: Query<E>, opts?: RequestOptions) {
    return this.querier.findManyAndCount(this.entity, qm, opts);
  }

  insertOne(payload: E, opts?: RequestOptions) {
    return this.querier.insertOne(this.entity, payload, opts);
  }

  updateOneById(id: FieldValue<E>, payload: E, opts?: RequestOptions) {
    return this.querier.updateOneById(this.entity, id, payload, opts);
  }

  saveOne(payload: E, opts?: RequestOptions) {
    return this.querier.saveOne(this.entity, payload, opts);
  }

  deleteOneById(id: FieldValue<E>, opts?: QueryOptions) {
    return this.querier.deleteOneById(this.entity, id, opts);
  }

  deleteMany(qm: QueryCriteria<E>, opts?: QueryOptions) {
    return this.querier.deleteMany(this.entity, qm, opts);
  }
}
