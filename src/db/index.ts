import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __qbDb?: Db };

export function dataDir() {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
}

// 웹 서버와 에이전트 워커가 같은 SQLite 파일을 공유 (WAL 모드)
export function getDb(): Db {
  if (g.__qbDb) return g.__qbDb;
  mkdirSync(dataDir(), { recursive: true });
  const sqlite = new Database(path.join(dataDir(), "app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  g.__qbDb = db;
  return db;
}

export { schema };
