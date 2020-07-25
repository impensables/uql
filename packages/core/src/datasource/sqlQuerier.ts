import { Query, QueryFilter, QueryUpdateResult, QueryOptions, QueryOneFilter } from '../type';
import { mapRows } from '../util/rowsMapper.util';
import { QuerierPoolConnection, Querier } from './type';
import { SqlDialect } from './sqlDialect';

export abstract class SqlQuerier extends Querier {
  protected hasPendingTransaction?: boolean;

  constructor(protected readonly dialect: SqlDialect, protected readonly conn: QuerierPoolConnection) {
    super();
  }

  async query<T>(sql: string): Promise<T> {
    console.debug(`\nquery: ${sql}\n`);
    const res: [T] = await this.conn.query(sql);
    return res[0];
  }

  async insert<T>(type: { new (): T }, bodies: T[]): Promise<number[]> {
    const query = this.dialect.insert(type, bodies);
    const res = await this.query<QueryUpdateResult>(query);
    const ids = Array<number>(bodies.length)
      .fill(res.insertId)
      .map((firstId, index) => firstId + index);
    return ids;
  }

  async insertOne<T>(type: { new (): T }, body: T): Promise<number> {
    const query = this.dialect.insert(type, body);
    const res = await this.query<QueryUpdateResult>(query);
    return res.insertId;
  }

  async update<T>(type: { new (): T }, filter: QueryFilter<T>, body: T): Promise<number> {
    const query = this.dialect.update(type, filter, body);
    const res = await this.query<QueryUpdateResult>(query);
    return res.affectedRows;
  }

  findOne<T>(type: { new (): T }, qm: QueryOneFilter<T>, opts?: QueryOptions): Promise<T> {
    (qm as Query<T>).limit = 1;
    return this.find(type, qm, opts).then((rows) => (rows ? rows[0] : undefined));
  }

  async find<T>(type: { new (): T }, qm: Query<T>, opts?: QueryOptions): Promise<T[]> {
    const query = this.dialect.find(type, qm, opts);
    const res = await this.query<T[]>(query);
    const data = mapRows(res);
    return data;
  }

  async count<T>(type: { new (): T }, filter?: QueryFilter<T>): Promise<number> {
    const query = this.dialect.find(
      type,
      { project: { 'COUNT(*) count': 1 } as any, filter },
      { isTrustedProject: true }
    );
    const res = await this.query<{ count: number }[]>(query);
    return Number(res[0].count);
  }

  async remove<T>(type: { new (): T }, filter: QueryFilter<T>): Promise<number> {
    const query = this.dialect.remove(type, filter);
    const res = await this.query<QueryUpdateResult>(query);
    return res.affectedRows;
  }

  get hasOpenTransaction(): boolean {
    return this.hasPendingTransaction;
  }

  async beginTransaction(): Promise<void> {
    if (this.hasPendingTransaction) {
      throw new Error('There is a pending transaction.');
    }
    await this.query(this.dialect.beginTransactionCommand);
    this.hasPendingTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.hasPendingTransaction) {
      throw new Error('There is not a pending transaction.');
    }
    await this.query('COMMIT');
    this.hasPendingTransaction = undefined;
  }

  async rollback(): Promise<void> {
    if (!this.hasPendingTransaction) {
      throw new Error('There is not a pending transaction.');
    }
    await this.query('ROLLBACK');
    this.hasPendingTransaction = undefined;
  }

  async release(): Promise<void> {
    if (this.hasPendingTransaction) {
      throw new Error('Querier should not be released while there is an open transaction.');
    }
    return this.conn.release();
  }
}