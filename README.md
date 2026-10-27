# jamiya-backend

Express + MongoDB API for Jamia as-Suffah.

## Requirements

- Node.js 20 or newer; developed on Node 26 (`nvm use` reads `.nvmrc`).
- Docker, for the local MongoDB.

## Local setup

```sh
nvm use
npm ci
cp .env.example .env      # then set JWT_SECRET, e.g. openssl rand -hex 32
npm run db:up             # MongoDB 7.0 on 127.0.0.1:27017
npm run dev
```

MongoDB is pinned to 7.0.45: the 8.x images refuse to start on Linux
kernel 6.19+ (SERVER-121912).

## Tests

```sh
npm test
```

Jest + supertest against the `jamiya_test` database (`MONGODB_URI_TEST`),
which is wiped between tests. Needs the database from `npm run db:up`.

Tests marked `test.failing` document known bugs: they pass while the bug
exists. Once a bug is fixed, its test starts failing; switch it to `test`.

## Baseline

The `baseline` tag marks the project as it was before the maintenance work.

## Lab report

`report/` holds the CSE 4802 maintenance lab report and everything needed to
regenerate it (`npm run report`). See `report/README.md` for how it is built
and `report/VIVA.md` for a full explanation for the viva.
