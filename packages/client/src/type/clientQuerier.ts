import { Query, QueryOne, Type, UniversalQuerier, QueryCriteria, FieldValue, QueryOptions, QuerySearch } from '@uql/core/type';
import { ClientRepository } from './clientRepository';
import { RequestOptions, RequestSuccessResponse } from './request';

export interface ClientQuerier extends UniversalQuerier {
  count<E>(entity: Type<E>, qm?: QuerySearch<E>, opts?: RequestOptions): Promise<RequestSuccessResponse<number>>;

  findOneById<E>(entity: Type<E>, id: FieldValue<E>, qo: QueryOne<E>, opts?: RequestOptions): Promise<RequestSuccessResponse<E>>;

  findOne<E>(entity: Type<E>, qm: Query<E>, opts?: RequestOptions): Promise<RequestSuccessResponse<E>>;

  findMany<E>(entity: Type<E>, qm: Query<E>, opts?: RequestOptions): Promise<RequestSuccessResponse<E[]>>;

  findManyAndCount<E>(entity: Type<E>, qm: Query<E>, opts?: RequestOptions): Promise<RequestSuccessResponse<E[]>>;

  insertOne<E>(entity: Type<E>, payload: E, opts?: RequestOptions): Promise<RequestSuccessResponse<any>>;

  insertMany?<E>(entity: Type<E>, payload: E[], opts?: RequestOptions): Promise<RequestSuccessResponse<any[]>>;

  updateOneById<E>(entity: Type<E>, id: FieldValue<E>, payload: E, opts?: RequestOptions): Promise<RequestSuccessResponse<number>>;

  updateMany?<E>(entity: Type<E>, qm: QueryCriteria<E>, payload: E, opts?: RequestOptions): Promise<RequestSuccessResponse<number>>;

  saveOne<E>(entity: Type<E>, payload: E, opts?: RequestOptions): Promise<RequestSuccessResponse<E>>;

  deleteOneById<E>(entity: Type<E>, id: FieldValue<E>, opts?: QueryOptions & RequestOptions): Promise<RequestSuccessResponse<number>>;

  deleteMany<E>(entity: Type<E>, qm: QueryCriteria<E>, opts?: QueryOptions & RequestOptions): Promise<RequestSuccessResponse<number>>;

  getRepository<E>(entity: Type<E>): ClientRepository<E>;
}
