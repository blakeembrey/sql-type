# SQL Type

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> Type-safe SQL builder using [ES2015 template tags](https://github.com/blakeembrey/sql-template-tag).

## Installation

```
npm install sql-type --save
```

## Usage

```ts
import {
  query,
  Table,
  Column,
  DefaultColumn,
  CreateExpression,
  ResultExpression
} from "sql-type";

export const table = new Table("users", {
  id: new Column<string>("id"),
  username: new Column<string>("username"),
  createdAt: new DefaultColumn<Date>("created_at")
});

export type CreateData = Omit<CreateExpression<typeof table>, "id">;

export type Model = ResultExpression<typeof table>;

export async function one<T>(query: Query<T>) {
  const result = await conn.query(query);
  const { length } = result.rows;
  if (length !== 1) throw new TypeError(`Expected 1 row, got ${length}`);
  return query.decode(result.rows[0]);
}

export async function create(data: CreateData) {
  return one(table.create(data).return(table.keys));
}
```

## License

MIT

[npm-image]: https://img.shields.io/npm/v/sql-type.svg?style=flat
[npm-url]: https://npmjs.org/package/sql-type
[downloads-image]: https://img.shields.io/npm/dm/sql-type.svg?style=flat
[downloads-url]: https://npmjs.org/package/sql-type
[travis-image]: https://img.shields.io/travis/blakeembrey/sql-type.svg?style=flat
[travis-url]: https://travis-ci.org/blakeembrey/sql-type
[coveralls-image]: https://img.shields.io/coveralls/blakeembrey/sql-type.svg?style=flat
[coveralls-url]: https://coveralls.io/r/blakeembrey/sql-type?branch=master
