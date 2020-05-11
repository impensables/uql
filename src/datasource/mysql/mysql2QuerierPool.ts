import { createPool, Pool, PoolOptions } from 'mysql2/promise';
import { QuerierPool } from '../type';
import { MySqlQuerier } from './mysqlQuerier';

export default class MySql2QuerierPool implements QuerierPool {
  private readonly pool: Pool;

  constructor(protected readonly opts: PoolOptions) {
    this.pool = createPool(opts);
  }

  async getQuerier() {
    const conn = await this.pool.getConnection();
    return new MySqlQuerier(conn);
  }
}