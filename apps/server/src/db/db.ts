import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'claudio.db');
const DATA_DIR = path.dirname(DB_PATH);

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.run(schema);
  saveDb();

  return db;
}

export function getDbSync(): Database {
  if (!db) throw new Error('DB not initialized. Call getDb() first.');
  return db;
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
