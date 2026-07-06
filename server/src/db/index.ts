import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schemaSQL } from './schema.js';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'interview.db');

// 确保数据库文件所在目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(dbPath);

// 启用外键约束，确保级联删除生效
db.exec('PRAGMA foreign_keys = ON;');

// 迁移：为已存在的数据库补充 company_name 列，并将 email/company_domain 改为可空
// 必须在 schemaSQL 执行前完成，否则 schema 中的 idx_interviewer_access_company_name
// 索引会在旧表（无 company_name 列）上创建失败，导致服务无法启动。
function migrateInterviewerAccess() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'interviewer_access'`)
    .get() as { name: string } | undefined;

  if (!tableExists) {
    return;
  }

  const tableInfo = db.prepare(`PRAGMA table_info(interviewer_access)`).all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(c => c.name);

  if (columnNames.includes('company_name')) {
    return;
  }

  console.log('[DB] Migrating interviewer_access table for company_name support...');

  db.exec(`
    ALTER TABLE interviewer_access RENAME TO interviewer_access_old;

    CREATE TABLE interviewer_access (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      company_domain TEXT,
      company_name TEXT,
      session_token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      verified_at INTEGER NOT NULL,
      last_access_at INTEGER,
      ip TEXT,
      ua TEXT
    );

    INSERT INTO interviewer_access (
      id, email, company_domain, session_token, expires_at, verified_at, last_access_at, ip, ua
    )
    SELECT
      id, email, company_domain, session_token, expires_at, verified_at, last_access_at, ip, ua
    FROM interviewer_access_old;

    CREATE INDEX idx_interviewer_access_token ON interviewer_access(session_token);
    CREATE INDEX idx_interviewer_access_email ON interviewer_access(email);
    CREATE INDEX idx_interviewer_access_company_name ON interviewer_access(company_name);

    DROP TABLE interviewer_access_old;
  `);

  console.log('[DB] Migration completed.');
}

migrateInterviewerAccess();

// 初始化表结构（包括 IF NOT EXISTS 的表与索引）
db.exec(schemaSQL);

console.log(`[DB] SQLite initialized at ${dbPath}`);
