import { Pool, PoolConfig } from 'pg';
import { QuerierPool } from '../type';
import { PostgresQuerier } from './postgresQuerier';

export default class PgQuerierPool implements QuerierPool {
  private readonly pool: Pool;

  constructor(readonly opts: PoolConfig) {
    this.pool = new Pool(opts);
  }

  async getQuerier() {
    const conn = await this.pool.connect();
    return new PostgresQuerier(conn);
  }
}