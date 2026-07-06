/**
 * 聊天流式接口 (POST /api/chat)
 *
 * 使用场景：面试官在对话框中输入问题后，后端基于 RAG + Memory 流程实时返回 AI 回答。
 * 作用：
 * 1. 接收用户消息，检索知识库中相关的项目文档片段（Embedding 相似度匹配）。
 * 2. 通过 MemoryManager 构建上下文：滑动窗口保留近期对话 + 摘要保留长期记忆。
 * 3. 将检索结果与对话摘要注入 System Prompt，构建完整的对话上下文。
 * 4. 调用 LLM（通义千问 qwen-plus）以 SSE 流式返回回答，前端实时逐字显示。
 * 5. 自动保存用户问题和 AI 回复到当前会话的数据库记录中。
 */
import { Router, Request, Response } from 'express';
import { retrieveRelevantChunks } from '../services/retriever.js';
import { streamChat } from '../services/llm.js';
import { buildPromptWithContext, SYSTEM_PROMPT } from '../services/prompt.js';
import {
  createConversation,
  conversationBelongsToUser,
  touchConversation,
} from '../services/conversationService.js';
import { addMessage } from '../services/messageService.js';
import { buildMemoryContext } from '../services/memoryManager.js';
import type { ChatRequest, Message } from '../types/index.js';

const router = Router();

/**
 * POST /api/chat
 * 核心聊天接口，SSE 流式输出。
 * 客户端发送 { message, user_id, conversation_id?, history? }，
 * 服务端返回 text/event-stream，逐段输出 AI 回答，最后以 data: [DONE] 标记结束。
 *
 * 核心流程调整：所有可能耗时的操作（RAG 检索、Memory 构建）在 flushHeaders 之前完成，
 * 避免 SSE 连接建立后前端白等。
 */
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  let conversationId: string | undefined;

  try {
    const { message, history = [], user_id, conversation_id } = req.body as ChatRequest;

    // ── 请求体验证 ─────────────────────────────────────────
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required and must be a string' });
      return;
    }
    if (!Array.isArray(history)) {
      res.status(400).json({ error: 'history must be an array' });
      return;
    }
    if (user_id && typeof user_id !== 'string') {
      res.status(400).json({ error: 'user_id must be a string' });
      return;
    }
    if (conversation_id && typeof conversation_id !== 'string') {
      res.status(400).json({ error: 'conversation_id must be a string' });
      return;
    }

    // ── 会话管理与权限检查 ─────────────────────────────────
    if (user_id) {
      if (conversation_id) {
        if (!conversationBelongsToUser(conversation_id, user_id)) {
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }
        conversationId = conversation_id;
      } else {
        const conversation = createConversation(user_id, message.slice(0, 20));
        conversationId = conversation.id;
      }
      addMessage(conversationId, 'user', message);
    }

    // ── 阶段 1: RAG 知识库检索（可能耗时，在 SSE 之前完成）──
    let contextText = '';
    try {
      const chunks = await retrieveRelevantChunks(message, 3);
      if (chunks.length > 0) {
        contextText = chunks
          .map((chunk, i) => `[${i + 1}] ${chunk.title}\n${chunk.content}`)
          .join('\n\n');
      }
    } catch (error) {
      console.warn('[Chat] Retrieval failed, proceeding without context:', error);
    }

    // ── 阶段 2: Memory 上下文构建（滑动窗口 + 摘要，在 SSE 之前完成）──
    let memoryContext;
    try {
      memoryContext = conversationId
        ? await buildMemoryContext(conversationId, message)
        : { summary: '', recentMessages: history, overflowCount: 0, totalTokens: 0 };
    } catch (error) {
      console.warn('[Chat] Memory build failed, fallback to raw history:', error);
      memoryContext = { summary: '', recentMessages: history, overflowCount: 0, totalTokens: 0 };
    }

    // ── 阶段 3: 组装 System Prompt ──────────────────────────
    // 将对话摘要、人设 Prompt、知识库上下文合并为 system message
    const summaryBlock = memoryContext.summary
      ? `【历史对话摘要】\n${memoryContext.summary}\n\n`
      : '';

    const systemContent = `${SYSTEM_PROMPT}\n\n${summaryBlock}${contextText ? `以下是相关项目文档供参考：\n${contextText}` : ''}`;

    const systemMessage: Message = { role: 'system', content: systemContent };

    const messages: Message[] = [
      systemMessage,
      ...memoryContext.recentMessages,
      { role: 'user', content: message },
    ];

    console.log(
      `[Chat] Context assembled: ${messages.length} messages, ` +
        `summary=${memoryContext.summary ? 'yes' : 'no'}, ` +
        `overflow=${memoryContext.overflowCount}, ` +
        `estTokens=${memoryContext.totalTokens}`
    );

    // ── 阶段 4: SSE 流式输出 ────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let isClientDisconnected = false;
    req.on('close', () => {
      isClientDisconnected = true;
    });

    let assistantContent = '';

    try {
      for await (const content of streamChat(messages)) {
        if (isClientDisconnected) break;
        assistantContent += content;
        res.write(`data: ${JSON.stringify({ content }) }\n\n`);
      }
    } catch (error) {
      if (!isClientDisconnected) {
        console.error('[Chat] Stream error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Generation failed' }) }\n\n`);
      }
    }

    if (!isClientDisconnected) {
      res.write('data: [DONE]\n\n');
    }

    // ── 阶段 5: 持久化 assistant 回复 ────────────────────────
    if (conversationId && assistantContent.trim()) {
      addMessage(conversationId, 'assistant', assistantContent);
      touchConversation(conversationId);
    }

    res.end();
  } catch (error) {
    console.error('[Chat] Unexpected error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

export default router;
