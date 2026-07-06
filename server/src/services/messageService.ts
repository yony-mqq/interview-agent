import { db } from '../db/index.js';
import type { Message } from '../types/index.js';

export interface StoredMessage extends Message {
  id: number;
  created_at: string;
}

export function addMessage(
  conversationId: string,
  role: Message['role'],
  content: string
): number {
  const stmt = db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  );
  const result = stmt.run(conversationId, role, content);
  return result.lastInsertRowid as number;
}

export function getMessages(
  conversationId: string,
  limit = 50
): StoredMessage[] {
  const stmt = db.prepare(
    `SELECT id, role, content, created_at
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC
     LIMIT ?`
  );
  const rows = stmt.all(conversationId, limit) as StoredMessage[];

  // 过滤掉系统消息，只保留 user/assistant 用于构造 history
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  }));
}

export function getHistoryMessages(
  conversationId: string,
  limit = 50
): Message[] {
  const messages = getMessages(conversationId, limit);
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}
