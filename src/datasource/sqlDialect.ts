import { escape, escapeId, objectToValues } from 'sqlstring';
import {
  QueryFilter,
  Query,
  QueryPrimitive,
  QueryComparisonOperator,
  QuerySort,
  QueryPager,
  QueryOptions,
  QueryProject,
  QueryLogicalOperatorKey,
  QueryLogicalOperatorValue,
} from '../type';
import { getEntityMeta, ColumnPersistableMode } from '../entity';

export abstract class SqlDialect {
  readonly beginTransactionCommand: string = 'BEGIN';

  insert<T>(type: { new (): T }, body: T | T[]) {
    const meta = getEntityMeta(type);
    const bodies = Array.isArray(body) ? body : [body];
    const samplePersistableBody = filterPersistable(type, bodies[0], 'insert');
    const properties = Object.keys(samplePersistableBody);
    const columns = properties.map((col) => meta.columns[col].name);
    const values = bodies.map((body) => properties.map((property) => escape(body[property])).join(', ')).join('), (');
    return `INSERT INTO ${escapeId(meta.name)} (${escapeId(columns)}) VALUES (${values})`;
  }

  update<T>(type: { new (): T }, filter: QueryFilter<T>, body: T, limit?: number) {
    const meta = getEntityMeta(type);
    const persistable = filterPersistable(type, body, 'update');
    const persistableData = Object.keys(persistable).reduce((acc, key) => {
      acc[meta.columns[key].name] = body[key];
      return acc;
    }, {} as T);
    const values = objectToValues(persistableData);
    const where = this.where(filter);
    const pager = this.pager({ limit });
    return `UPDATE ${escapeId(meta.name)} SET ${values} WHERE ${where}${pager}`;
  }

  remove<T>(type: { new (): T }, filter: QueryFilter<T>, limit?: number) {
    const meta = getEntityMeta(type);
    const where = this.where(filter);
    const pager = this.pager({ limit });
    return `DELETE FROM ${escapeId(meta.name)} WHERE ${where}${pager}`;
  }

  find<T>(type: { new (): T }, qm: Query<T>, opts?: QueryOptions) {
    const select = this.select<T>(type, qm, opts);
    const where = this.where<T>(qm.filter, { usePrefix: true });
    const sort = this.sort<T>(qm.sort);
    const pager = this.pager(qm);
    return select + where + sort + pager;
  }

  columns<T>(type: { new (): T }, project: QueryProject<T>, opts: { prefix?: string; alias?: boolean } & QueryOptions) {
    if (opts.isTrustedProject) {
      return Object.keys(project).join(', ');
    }

    const prefix = opts.prefix ? `${escapeId(opts.prefix, true)}.` : '';

    if (!project) {
      if (!opts.alias) {
        return `${prefix}*`;
      }
      const meta = getEntityMeta(type);
      project = Object.keys(meta.columns).reduce((acc, it) => {
        acc[it] = 1;
        return acc;
      }, {} as QueryProject<T>);
    }

    const nameMapper = opts.alias
      ? (name: string) => `${prefix}${escapeId(name)} ${escapeId(opts.prefix + '.' + name, true)}`
      : (name: string) => `${prefix}${escapeId(name)}`;

    return Object.keys(project).map(nameMapper).join(', ');
  }

  select<T>(type: { new (): T }, qm: Query<T>, opts?: QueryOptions) {
    const meta = getEntityMeta(type);
    const baseSelect = this.columns(type, qm.project, {
      prefix: qm.populate && type.name,
      ...opts,
    });
    const { joinsSelect, joinsTables } = this.joins(type, qm);
    return `SELECT ${baseSelect}${joinsSelect} FROM ${escapeId(meta.name)}${joinsTables}`;
  }

  joins<T>(type: { new (): T }, qm: Query<T>, prefix = '') {
    let joinsSelect = '';
    let joinsTables = '';
    const meta = getEntityMeta(type);
    for (const popKey in qm.populate) {
      const relOpts = meta.relations[popKey];
      if (!relOpts) {
        throw new Error(`'${type.name}.${popKey}' is not annotated with a relation decorator`);
      }
      const joinPrefix = prefix ? prefix + '.' + popKey : popKey;
      const joinPath = escapeId(joinPrefix, true);
      const relType = relOpts.type();
      const popVal = qm.populate[popKey];
      const relColumns = this.columns(relType, popVal?.project, {
        prefix: joinPrefix,
        alias: true,
      });
      joinsSelect += `, ${relColumns}`;
      const relMeta = getEntityMeta(relType);
      const relTypeName = escapeId(relMeta.name);
      const rel = prefix ? escapeId(prefix, true) + '.' + escapeId(popKey) : `${escapeId(meta.name)}.${joinPath}`;
      joinsTables += ` LEFT JOIN ${relTypeName} ${joinPath} ON ${joinPath}.${escapeId(relMeta.id)} = ${rel}`;
      if (popVal?.populate) {
        const { joinsSelect: subJoinSelect, joinsTables: subJoinTables } = this.joins(relType, popVal, joinPrefix);
        joinsSelect += subJoinSelect;
        joinsTables += subJoinTables;
      }
    }
    return { joinsSelect, joinsTables };
  }

  where<T>(filter: QueryFilter<T>, opts: { filterLink?: QueryLogicalOperatorValue; usePrefix?: boolean } = {}): string {
    const filterKeys = filter && Object.keys(filter);
    if (!filterKeys) {
      return '';
    }

    const filterLink: QueryLogicalOperatorValue = opts.filterLink || 'AND';

    const sql = filterKeys
      .map((key) => {
        const val = filter[key];
        if (key === '$and' || key === '$or') {
          const logicalOperator = key;
          let whereOpts: typeof opts;
          if (logicalOperator === '$or') {
            whereOpts = { filterLink: 'OR' };
          }
          const hasPrecedence = filterKeys.length > 1 && Object.keys(val).length > 1;
          const filterItCondition = this.where(val, whereOpts);
          return hasPrecedence ? `(${filterItCondition})` : filterItCondition;
        }
        return this.comparison(key, val);
      })
      .join(` ${filterLink} `);

    return opts.usePrefix ? ` WHERE ${sql}` : sql;
  }

  comparison<T>(key: string, value: object | QueryPrimitive) {
    const val = typeof value === 'object' && value !== null ? value : { $eq: value };
    const operators = Object.keys(val) as (keyof QueryComparisonOperator<T>)[];
    const operations = operators.map((operator) => this.comparisonOperation(key, operator, val[operator])).join(' AND ');
    return operators.length > 1 ? `(${operations})` : operations;
  }

  comparisonOperation<T, K extends keyof QueryComparisonOperator<T>>(
    attr: keyof T,
    operator: K,
    val: QueryComparisonOperator<T>[K]
  ) {
    switch (operator) {
      case '$eq':
        return val === null ? `${escapeId(attr)} IS NULL` : `${escapeId(attr)} = ${escape(val)}`;
      case '$ne':
        return val === null ? `${escapeId(attr)} IS NOT NULL` : `${escapeId(attr)} <> ${escape(val)}`;
      case '$gt':
        return `${escapeId(attr)} > ${escape(val)}`;
      case '$gte':
        return `${escapeId(attr)} >= ${escape(val)}`;
      case '$lt':
        return `${escapeId(attr)} < ${escape(val)}`;
      case '$lte':
        return `${escapeId(attr)} <= ${escape(val)}`;
      case '$startsWith':
        return `LOWER(${escapeId(attr)}) LIKE ${escape((val as string).toLowerCase() + '%')}`;
      case '$in':
        return `${escapeId(attr)} IN (${escape(val)})`;
      case '$nin':
        return `${escapeId(attr)} NOT IN (${escape(val)})`;
      case '$re':
        return `${escapeId(attr)} REGEXP ${escape(val)}`;
      default:
        throw new Error(`Unsupported comparison operator: ${operator}`);
    }
  }

  sort<T>(sort: QuerySort<T>) {
    if (!sort || Object.keys(sort).length === 0) {
      return '';
    }
    const order = Object.keys(sort)
      .map((prop) => {
        const direction = sort[prop] === -1 ? ' DESC' : '';
        return escapeId(prop) + direction;
      })
      .join(', ');
    return ` ORDER BY ${order}`;
  }

  pager(opts: QueryPager) {
    let sql = '';
    if (opts.limit) {
      sql += ` LIMIT ${Number(opts.limit)}`;
      if (opts.skip !== undefined) {
        sql += ` OFFSET ${Number(opts.skip)}`;
      }
    }
    return sql;
  }
}

function filterPersistable<T>(type: { new (): T }, body: T, mode: ColumnPersistableMode) {
  const meta = getEntityMeta(type);
  return Object.keys(body).reduce((persistableBody, prop) => {
    const propVal = body[prop];
    const colOpts = meta.columns[prop];
    const relOpts = meta.relations[prop];
    if (
      propVal !== undefined &&
      colOpts &&
      (!colOpts.mode || colOpts.mode === mode) &&
      // 'manyToOne' is the only relation which doesn't require additional stuff when persisting
      (!relOpts || relOpts.cardinality === 'manyToOne')
    ) {
      persistableBody[prop] = propVal;
    }
    return persistableBody;
  }, {} as T);
}
