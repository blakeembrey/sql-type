import { cache } from "decorator-cache-getter";
import {
  Sql,
  RawValue,
  Value,
  join as rJoin,
  raw as rRaw
} from "sql-template-tag";

/**
 * Export SQL template tag utilities.
 */
export { RawValue, Value, Sql };

/**
 * Support typed SQL expressions.
 */
export class TSql<T> extends Sql {
  __TYPE_OF__!: T;
}

/**
 * Raw SQL types.
 */
export type TRawValue<T extends Value | unknown> = T | TSql<T>;

/**
 * Get type of a SQL expression.
 */
export type TypeOfSql<T extends Sql> = T extends TSql<infer U> ? U : never;

/**
 * Typed SQL expressions.
 */
export function sql<T = unknown>(
  strings: TemplateStringsArray,
  ...values: RawValue[]
) {
  return new TSql<T>(strings, values);
}

/**
 * Typed raw value.
 */
export function raw<T = unknown>(value: string) {
  return rRaw(value) as TSql<T>;
}

/**
 * Typed join utility.
 */
export function join<T extends any[]>(
  values: { [K in keyof T]: TRawValue<T[K]> },
  separator?: string
) {
  return rJoin(values, separator) as TSql<T>;
}

/**
 * Quote an identifier.
 */
export function quote(name: string) {
  return /^[a-z0-9_]+$/.test(name) ? name : `"${name}"`;
}

/**
 * A column is a typed SQL expression.
 */
export class Column<T> extends TSql<T> {
  constructor(public name: string) {
    super([quote(name)], []);
  }
}

/**
 * A default column extends `Column` with type information for default values.
 */
export class DefaultColumn<T> extends Column<T> {
  hasDefaultValue = true;
}

/**
 * all values of an interface.
 */
export type ValueOf<T> = T[keyof T];

/**
 * Pick the default table columns from a dictionary.
 */
export type DefaultColumns<T extends Record<string, Column<any>>> = ValueOf<
  { [K in keyof T]: T[K] extends DefaultColumn<any> ? K : never }
>;

/**
 * Pick nullable columns from a dictionary.
 */
export type NullableColumns<T extends Record<string, Column<any>>> = ValueOf<
  { [K in keyof T]: Extract<TypeOfSql<T[K]>, null> extends never ? never : K }
>;

/**
 * Get not required columns for create.
 */
export type NotRequiredColumns<T extends Record<string, Column<any>>> =
  | NullableColumns<T>
  | DefaultColumns<T>;

/**
 * Map columns to expected values.
 */
export type ColumnValues<T extends Record<string, Sql>> = {
  [K in keyof T]: TRawValue<TypeOfSql<T[K]>>
};

/**
 * Generate the interface for `INSERT` subtracting default columns.
 */
export type CreateExpression<T extends Table<any>> = ColumnValues<
  Omit<T["columns"], NotRequiredColumns<T["columns"]>>
> &
  Partial<ColumnValues<Pick<T["columns"], DefaultColumns<T["columns"]>>>>;

/**
 * Get the partial expression (e.g. `UPDATE`) for a table.
 */
export type UpdateExpression<T extends Table<any>> = Partial<
  ColumnValues<T["columns"]>
>;

/**
 * Extract raw types of table columns.
 */
export type TypeOfColumns<T extends Record<string, Sql>> = {
  [K in keyof T]: TypeOfSql<T[K]>
};

/**
 * Get the result expression from a table.
 */
export type ResultExpression<T extends Table<any>> = TypeOfColumns<
  T["columns"]
>;

/**
 * SQL row type.
 */
export type Row = Record<string, unknown>;

/**
 * Create a table instance.
 */
export class Table<C extends Record<string, Column<any>>> extends TSql<void> {
  constructor(public tableName: string, public columns: C) {
    super([quote(tableName)], []);
  }

  @cache
  get keys(): { [K in keyof C]: TSql<TypeOfSql<C[K]>> } {
    const result = Object.create(null);
    for (const [key, col] of Object.entries(this.columns)) {
      result[key] = e.label(this, col);
    }
    return result;
  }

  create(...items: CreateExpression<this>[]) {
    const keys = Object.keys(this.columns) as (keyof this["columns"])[];
    const columns = e.arg(join(keys.map(key => this.columns[key])));
    const values = join(
      items.map(item => {
        return e.arg(join(keys.map(key => (item as any)[key])));
      })
    );

    return query.insertInto(this).append(sql`${columns} VALUES ${values}`);
  }

  update(data: UpdateExpression<this>) {
    const expression = Object.entries(data)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        return e.eq(this.columns[key], value!);
      });

    return query.update(this).set(join(expression));
  }

  get() {
    return query.get(this.keys).from(this);
  }

  delete() {
    return query.deleteFrom(this);
  }
}

/**
 * Single SQL mapping value.
 */
export type SqlMappingValue = Sql | Record<string, Sql>;

/**
 * Dictionary selector of SQL.
 */
export type SqlMapping = SqlMappingValue | SqlMappingValue[];

/**
 * Extract type mapping of a SQL object.
 */
export type TypeOfSqlMappingValue<T> = T extends TSql<any>
  ? TypeOfSql<T>
  : T extends Record<string, TSql<any>>
  ? { [K in keyof T]: TypeOfSql<T[K]> }
  : never;

/**
 * Single result for a row mapping.
 */
export type RowMappingValue = string | Record<string, string>;

/**
 * Type of the value for `exec()` result mapping.
 */
export type RowMapping = RowMappingValue | RowMappingValue[];

/**
 * Query builder class for programmatically building SQL queries.
 */
export class Query<T = never, U = never> extends TSql<
  U extends [any] ? U[0] : U
> {
  constructor(
    strings: string[],
    values: RawValue[],
    public index: number,
    public mapping?: RowMapping
  ) {
    super(strings, values);
  }

  get<R extends SqlMappingValue>(
    value: Exclude<T, never> extends never ? R : never
  ): Query<TypeOfSqlMappingValue<R>, never> {
    return appendMappedQuery<TypeOfSqlMappingValue<R>>(
      this,
      sql`SELECT`,
      value
    );
  }

  getAll<R extends SqlMappingValue[]>(
    ...values: Exclude<T, never> extends never ? R : never
  ): Query<{ [K in keyof R]: TypeOfSqlMappingValue<R[K]> }, never> {
    return appendMappedQuery<{ [K in keyof R]: TypeOfSqlMappingValue<R[K]> }>(
      this,
      sql`SELECT`,
      values
    );
  }

  select<R extends unknown>(values: TSql<R>): Query<never, [R]>;
  select<R extends unknown[]>(values: TSql<R>): Query<never, R>;
  select<R extends unknown[]>(values: TSql<R>) {
    return appendQuery<never, R>(
      this,
      sql<R>`SELECT ${values}`,
      this.index,
      undefined
    );
  }

  returning<R extends SqlMappingValue>(
    value: Exclude<T, never> extends never ? R : never
  ): Query<TypeOfSqlMappingValue<R>, never> {
    return appendMappedQuery<TypeOfSqlMappingValue<R>>(
      this,
      sql`RETURNING`,
      value
    );
  }

  append(
    value: Sql | TemplateStringsArray,
    ...values: RawValue[]
  ): Query<T, U> {
    const child = value instanceof Sql ? value : new Sql(value, values);
    return appendQuery<T, U>(this, child, this.index, this.mapping);
  }

  insertInto(value: Sql) {
    return this.append`INSERT INTO ${value}`;
  }

  deleteFrom(value: Sql) {
    return this.append`DELETE FROM ${value}`;
  }

  update(value: Sql) {
    return this.append`UPDATE ${value}`;
  }

  set(value: Sql) {
    return this.append`SET ${value}`;
  }

  from(...values: Sql[]) {
    return this.append`FROM ${join(values)}`;
  }

  leftJoin(table: Sql, condition: Sql) {
    return this.append`LEFT JOIN ${table} ON ${condition}`;
  }

  join(table: Sql, condition: Sql) {
    return this.append`JOIN ${table} ON ${condition}`;
  }

  groupBy(value: Sql) {
    return this.append`GROUP BY ${value}`;
  }

  where(value: Sql) {
    return this.append`WHERE ${value}`;
  }

  orderBy(value: Sql, direction?: "ASC" | "DESC") {
    if (direction) return this.append`ORDER BY ${value} ${raw(direction)}`;

    return this.append`ORDER BY ${value}`;
  }

  limit(value?: TRawValue<number>) {
    if (value === undefined) return this;
    const limit = typeof value === "number" ? raw(String(value)) : value;
    return this.append`LIMIT ${limit}`;
  }

  offset(value?: number) {
    if (value === undefined) return this;
    return this.append`OFFSET ${raw(String(value))}`;
  }

  tap(fn: (value: this) => void) {
    fn(this);
    return this;
  }

  decode(row: Row) {
    return unpack(row, this.mapping) as T;
  }
}

/**
 * Query builder interface.
 */
export const query = new Query<never, never>([""], [], 0, undefined);

/**
 * SQL expression collection.
 */
export const e = {
  begin: sql<void>`BEGIN`,
  commit: sql<void>`COMMIT`,
  rollback: sql<void>`ROLLBACK`,
  now: sql<Date>`NOW()`,
  label: <T extends Value>(label: TSql<unknown>, element: TSql<T>) => {
    return sql<T>`${label}.${element}`;
  },
  extend: (...values: RawValue[]) => {
    return join(values, " ");
  },
  distinct: <T extends Value>(values: TRawValue<T>, condition?: Sql) => {
    if (condition === undefined) return sql<T>`DISTINCT ${values}`;
    return sql<T>`DISTINCT ${condition} ${values}`;
  },
  on: <T extends Value>(value: TSql<T>) => {
    return sql<T>`ON ${value}`;
  },
  list: <T extends unknown[]>(
    ...values: { [K in keyof T]: TRawValue<T[K]> }
  ): TSql<T> => {
    return join(values) as TSql<T>;
  },
  arg: <T extends any[]>(
    ...values: { [K in keyof T]: TRawValue<T[K]> }
  ): TSql<T> => {
    return sql<T>`(${join(values)})`;
  },
  and: (...values: TRawValue<boolean>[]) => {
    return sql<boolean>`(${join(values, " AND ")})`;
  },
  or: (...values: TRawValue<boolean>[]) => {
    return sql<boolean>`(${join(values, " OR ")})`;
  },
  eq: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} = ${b}`;
  },
  ne: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} != ${b}`;
  },
  lt: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} < ${b}`;
  },
  gt: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} > ${b}`;
  },
  lte: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} <= ${b}`;
  },
  gte: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} >= ${b}`;
  },
  mod: <T extends Value>(a: TRawValue<T>, b: TRawValue<T>) => {
    return sql<boolean>`${a} % ${b}`;
  },
  between: <T extends Value>(
    a: TRawValue<T>,
    b: TRawValue<T>,
    c: TRawValue<T>
  ) => {
    return sql<boolean>`${a} BETWEEN ${b} AND ${c}`;
  },
  isNull: <T extends Value>(a: TRawValue<T>) => {
    return sql<boolean>`${a} IS NULL`;
  },
  isNotNull: <T extends Value>(a: TRawValue<T>) => {
    sql<boolean>`${a} IS NOT NULL`;
  },
  in: <T extends Value>(
    item: TRawValue<T>,
    values: TRawValue<T>[] | TSql<T>
  ) => {
    const value = Array.isArray(values) ? join(values) : values;
    return sql<boolean>`${item} IN (${value})`;
  },
  notIn: <T extends Value>(
    item: TRawValue<T>,
    values: TRawValue<T>[] | TSql<T>
  ) => {
    const value = Array.isArray(values) ? join(values) : values;
    return sql<boolean>`${item} NOT IN (${value})`;
  },
  concat: <T extends Value>(...values: TRawValue<T>[]) => {
    return sql<T>`CONCAT(${join(values)})`;
  },
  as: <T extends Value>(value: TRawValue<T>, key: TSql<T>) => {
    return sql<T>`${value} AS ${key}`;
  },
  count: (value: TRawValue<any>) => {
    return sql<number>`COUNT(${value})`;
  }
};

/**
 * Append a value to the current query.
 */
function appendQuery<T, U>(
  parent: Sql,
  child: Sql,
  index: number,
  mapping?: RowMapping
) {
  const query = parent.text ? sql`${parent} ${child}` : child;
  return new Query<T, U>(query.strings, query.values, index, mapping);
}

/**
 * Append a SQL mapped query to the existing query.
 */
function appendMappedQuery<T>(
  query: Query<any, any>,
  keyword: Sql,
  values: SqlMapping
) {
  const [items, mapping, index] = mapQuery(values, query.index);
  const selects = join(items.map(([key, value]) => e.as(value, raw(key))));

  return appendQuery<T, never>(
    query,
    sql`${keyword} ${selects}`,
    index,
    mapping
  );
}

/**
 * Convert a SQL mapping input to `exec` result.
 */
function mapQuery<T extends SqlMapping>(
  query: T,
  index: number
): [Array<[string, Sql]>, RowMapping, number] {
  const items: Array<[string, Sql]> = [];
  let nameIndex = index;

  function mapValue(value: SqlMappingValue): RowMappingValue {
    if (value instanceof Sql) {
      const name = `x${nameIndex++}`;
      items.push([name, value]);
      return name;
    }

    const record: Record<string, string> = {};
    for (const [key, sql] of Object.entries(value)) {
      const name = `x${nameIndex++}`;
      items.push([name, sql]);
      record[key] = name;
    }
    return record;
  }

  if (!Array.isArray(query)) {
    return [items, mapValue(query as SqlMappingValue), nameIndex];
  }

  return [items, query.map(x => mapValue(x)), nameIndex];
}

/**
 * Unpack a single value to mapping.
 */
function unpackValue(mapping: RowMappingValue, row: Row) {
  if (typeof mapping === "string") return row[mapping];

  const record: Row = {};
  for (const [key, prop] of Object.entries(mapping)) record[key] = row[prop];
  return record;
}

/**
 * Convert a SQL row back into the mapping.
 */
function unpack(row: Row, mapping?: RowMappingValue | RowMappingValue[]) {
  if (!mapping) return undefined;
  if (!Array.isArray(mapping)) return unpackValue(mapping, row);
  return mapping.map(x => unpackValue(x, row));
}
