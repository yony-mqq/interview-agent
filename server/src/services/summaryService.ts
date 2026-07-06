/**
 * 对话摘要服务
 *
 * 负责 conversation_summaries 表的读写，以及调用 LLM 生成摘要。
 */
import { db } from '../db/index.js';
import OpenAI from 'openai';
import type { Message } from '../types/index.js';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 30000,
});

export interface ConversationSummary {
  conversation_id: string;
  summary: string;
  message_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * 获取某会话的现有摘要
 */
export function getSummary(conversationId: string): ConversationSummary | undefined {
  const stmt = db.prepare('SELECT * FROM conversation_summaries WHERE conversation_id = ?');
  return stmt.get(conversationId) as ConversationSummary | undefined;
}

/**
 * 保存或更新摘要
 */
export function upsertSummary(
  conversationId: string,
  summary: string,
  messageCount: number,
  tokenCount: number
): void {
  const stmt = db.prepare(`
    INSERT INTO conversation_summaries
      (conversation_id, summary, message_count, token_count, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(conversation_id) DO UPDATE SET
      summary = excluded.summary,
      message_count = excluded.message_count,
      token_count = excluded.token_count,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(conversationId, summary, messageCount, tokenCount);
}

/**
 * 删除某会话的摘要
 */
export function deleteSummary(conversationId: string): boolean {
  const stmt = db.prepare('DELETE FROM conversation_summaries WHERE conversation_id = ?');
  const result = stmt.run(conversationId);
  return result.changes > 0;
}

const SUMMARY_PROMPT = `请用一段简洁的文字总结以下对话的核心内容。要求：
1. 保留面试官问过的关键问题和候选人的核心回答要点
2. 保留提到的项目名称、技术栈、关键数据
3. 不要展开细节，只保留索引级的信息
4. 控制在 200 字以内

对话内容：
`;

/**
 * 调用轻量级模型生成对话摘要
 * @param messages 需要被摘要的消息列表（按时间正序）
 * @returns 摘要文本
 */
export async function generateSummary(messages: Message[]): Promise<string> {
  if (messages.length === 0) return '';

  const dialogueText = messages
    .map((m) => `${m.role === 'user' ? '面试官' : '候选人'}：${m.content}`)
    .join('\n\n');

  try {
    const response = await client.chat.completions.create({
      model: 'qwen-turbo', // 轻量模型，成本低
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: dialogueText },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('[Summary] Generation failed:', error);
    // 降级：直接拼接前几条消息的前 100 字作为摘要
    return messages
      .slice(0, 3)
      .map((m) => m.content.slice(0, 100))
      .join('；');
  }
}
