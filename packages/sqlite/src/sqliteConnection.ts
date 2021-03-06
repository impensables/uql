import { Database } from 'sqlite';
import { QuerierPoolConnection, QueryUpdateResult } from '@uql/core/type';
import { log } from '@uql/core';

export class SqliteConnection implements QuerierPoolConnection {
  constructor(readonly db: Database) {}

  async all<T>(query: string) {
    log(query);
    return this.db.all<T[]>(query);
  }

  async run(query: string) {
    log(query);
    const { changes, lastID } = await this.db.run(query);
    const firstId = lastID ? lastID - (changes - 1) : undefined;
    return { changes, firstId } as QueryUpdateResult;
  }

  async release() {
    // no-op
  }

  async end() {
    await this.db.close();
  }
}
