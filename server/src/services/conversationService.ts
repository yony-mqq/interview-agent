import crypto from 'crypto';
import { db } from '../db/index.js';

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export function createConversation(userId: string, title?: string): Conversation {
  const id = crypto.randomUUID();
  const defaultTitle = title ? title.slice(0, 20) : '新对话';

  const stmt = db.prepare(
    'INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)'
  );
  stmt.run(id, userId, defaultTitle);

  return {
    id,
    user_id: userId,
    title: defaultTitle,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function listConversations(userId: string, limit = 20): Conversation[] {
  const stmt = db.prepare(`
    SELECT c.id, c.user_id, c.title, c.created_at, c.updated_at, COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit) as Conversation[];
}

export function getConversationById(id: string): Conversation | undefined {
  const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  return stmt.get(id) as Conversation | undefined;
}

export function deleteConversation(id: string): boolean {
  const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function touchConversation(id: string): boolean {
  const stmt = db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function conversationBelongsToUser(id: string, userId: string): boolean {
  const stmt = db.prepare('SELECT 1 FROM conversations WHERE id = ? AND user_id = ?');
  const row = stmt.get(id, userId);
  return !!row;
}
