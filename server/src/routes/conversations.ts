/**
 * 会话管理接口
 *
 * 使用场景：左侧会话列表的增删改查，以及切换会话时加载历史消息。
 * 作用：
 * 1. 获取当前用户的所有会话列表（含消息数）。
 * 2. 创建新会话。
 * 3. 获取某个会话的全部历史消息。
 * 4. 删除指定会话及其关联消息。
 * 所有接口均通过 user_id 做归属校验，防止越权访问。
 */
import { Router, Request, Response } from 'express';
import {
  createConversation,
  listConversations,
  getConversationById,
  deleteConversation,
  conversationBelongsToUser,
} from '../services/conversationService.js';
import { getMessages } from '../services/messageService.js';

const router = Router();

/**
 * GET /api/conversations?user_id=xxx&limit=20
 * 获取当前用户的会话列表，用于左侧边栏展示。
 * 按 updated_at 倒序排列，返回会话标题、创建时间、消息数等。
 */
router.get('/conversations', (req: Request, res: Response) => {
  const { user_id } = req.query;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }

  try {
    const conversations = listConversations(user_id, limit);
    res.json({ conversations });
  } catch (error) {
    console.error('[Conversations] List error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * POST /api/conversations
 * 创建新会话。用户点击"新对话"按钮时调用。
 * 可选传入 title，否则默认截取用户首条消息前 20 字作为标题。
 */
router.post('/conversations', (req: Request, res: Response) => {
  const { user_id, title } = req.body;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }

  try {
    const conversation = createConversation(user_id, title);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('[Conversations] Create error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/conversations/:id/messages
 * 获取指定会话的历史消息列表。
 * 用户点击左侧某个会话时调用，用于恢复该会话的聊天记录。
 */
router.get('/conversations/:id/messages', (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.query;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }

  if (!conversationBelongsToUser(id, user_id)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const messages = getMessages(id, 50);
    res.json({ messages });
  } catch (error) {
    console.error('[Conversations] Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * DELETE /api/conversations/:id
 * 删除指定会话及其关联的所有消息。
 * 用户点击会话列表中的删除按钮时调用。
 */
router.delete('/conversations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }

  if (!conversationBelongsToUser(id, user_id)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const success = deleteConversation(id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (error) {
    console.error('[Conversations] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
