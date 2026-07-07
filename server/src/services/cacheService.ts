/**
 * 结果缓存服务
 *
 * 高频面试问题生成后缓存到 SQLite，相同 query 直接命中返回，
 * 避免重复调用 LLM，显著降低成本。
 */
import crypto from 'crypto';
import { db } from '../db/index.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天过期
const MAX_QUERY_LENGTH = 100; // 只缓存短问题

function md5(text: string): string {
  return crypto.createHash('md5').update(text, 'utf-8').digest('hex');
}

/**
 * 判断 query 是否适合缓存
 * - 只缓存用户问题（不缓存 assistant 回复）
 * - 长度不超过 100 字
 * - 不是追问类问题（不含"为什么""详细"等动态词）
 */
export function isCacheable(query: string): boolean {
  const q = query.trim();
  if (q.length > MAX_QUERY_LENGTH) return false;
  if (/为什么|怎么|如何|详细|具体|深入|接着|然后|那/.test(q)) return false;
  return true;
}

/**
 * 查询缓存
 * @returns 缓存的 response，未命中返回 null
 */
export function getCachedResponse(query: string): string | null {
  if (!isCacheable(query)) return null;

  const hash = md5(query.trim().toLowerCase());
  const stmt = db.prepare(
    'SELECT response, created_at FROM response_cache WHERE query_hash = ?'
  );
  const row = stmt.get(hash) as
    | { response: string; created_at: string }
    | undefined;

  if (!row) return null;

  // 检查过期
  const createdAt = new Date(row.created_at).getTime();
  if (Date.now() - createdAt > CACHE_TTL_MS) {
    db.prepare('DELETE FROM response_cache WHERE query_hash = ?').run(hash);
    return null;
  }

  // 命中：更新 hit_count
  db.prepare('UPDATE response_cache SET hit_count = hit_count + 1 WHERE query_hash = ?').run(
    hash
  );

  console.log(`[Cache] Hit for query: "${query.slice(0, 30)}..."`);
  return row.response;
}

/**
 * 写入缓存
 */
export function setCachedResponse(
  query: string,
  response: string,
  model: string
): void {
  if (!isCacheable(query)) return;

  const hash = md5(query.trim().toLowerCase());
  const stmt = db.prepare(`
    INSERT INTO response_cache (query_hash, query, response, model)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(query_hash) DO UPDATE SET
      response = excluded.response,
      model = excluded.model,
      hit_count = hit_count + 1,
      created_at = CURRENT_TIMESTAMP
  `);
  stmt.run(hash, query, response, model);
}

/**
 * 清理过期缓存
 */
export function cleanupExpiredCache(): number {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const stmt = db.prepare('DELETE FROM response_cache WHERE created_at < ?');
  const result = stmt.run(cutoff);
  return result.changes;
}
