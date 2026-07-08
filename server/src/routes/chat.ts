/**
 * 聊天流式接口 (POST /api/chat)
 *
 * 使用场景：面试官在对话框中输入问题后，后端基于 RAG + Memory + ReAct 流程实时返回 AI 回答。
 * 作用：
 * 1. 接收用户消息，通过 ReAct 流程逐步展示 Agent 思考过程（Thought → Action → Observation）。
 * 2. 检索知识库中相关的项目文档片段（Embedding 相似度匹配）。
 * 3. 通过 MemoryManager 构建上下文：滑动窗口保留近期对话 + 摘要保留长期记忆。
 * 4. 调用 LLM（通义千问 qwen-plus）以 SSE 流式返回回答，前端实时逐字显示。
 * 5. 自动保存用户问题和 AI 回复到当前会话的数据库记录中。
 */
import { Router, Request, Response } from 'express';
import { retrieveRelevantChunks } from '../services/retriever.js';
import { streamChat } from '../services/llm.js';
import { buildPromptWithContext, SYSTEM_PROMPT, analyzeIntent } from '../services/prompt.js';
import { classifyComplexity, selectModel } from '../services/modelRouter.js';
import { getCachedResponse, setCachedResponse } from '../services/cacheService.js';
import {
  createConversation,
  conversationBelongsToUser,
  touchConversation,
} from '../services/conversationService.js';
import { addMessage } from '../services/messageService.js';
import { buildMemoryContext } from '../services/memoryManager.js';
import { runMCPForQuery } from '../mcp/client.js';
import type { ChatRequest, Message, StreamEvent } from '../types/index.js';

const router = Router();

/**
 * 安全发送 SSE 事件
 */
function sendEvent(res: Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * POST /api/chat
 * 核心聊天接口，SSE 流式输出。
 *
 * ReAct 事件流：
 *   thought    → 分析用户意图
 *   tool_call  → 调用检索工具
 *   tool_result→ 返回检索结果
 *   content    → 流式输出最终回答
 *   [DONE]     → 结束标记
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

    // 输入截断保护：防止超长输入刷 Token
    const MAX_INPUT_LENGTH = 500;
    const safeMessage = message.slice(0, MAX_INPUT_LENGTH);
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
      addMessage(conversationId, 'user', safeMessage);
    }

    // ── 结果缓存查询 ───────────────────────────────────────
    const cachedResponse = getCachedResponse(safeMessage);
    if (cachedResponse) {
      // 缓存命中：直接流式输出，跳过 RAG / Memory / LLM
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let isClientDisconnected = false;
      req.on('close', () => {
        isClientDisconnected = true;
      });

      // 模拟思考过程（快速跳过）
      sendEvent(res, { type: 'thought', content: '从缓存中快速回复', step: 1 });
      sendEvent(res, { type: 'tool_call', name: 'cache_lookup', input: safeMessage });
      sendEvent(res, { type: 'tool_result', name: 'cache_lookup', output: '缓存命中，直接返回' });

      // 流式输出缓存内容（模拟打字机效果，每 20ms 发一段）
      const words = cachedResponse.split('');
      for (let i = 0; i < words.length; i += 3) {
        if (isClientDisconnected) break;
        const chunk = words.slice(i, i + 3).join('');
        sendEvent(res, { type: 'content', content: chunk });
      }

      if (!isClientDisconnected) {
        res.write('data: [DONE]\n\n');
      }

      // 持久化 assistant 回复
      if (conversationId) {
        addMessage(conversationId, 'assistant', cachedResponse);
        touchConversation(conversationId);
      }

      res.end();
      return;
    }

    // ═══════════════════════════════════════════════════════
    //  ReAct Step 1: Thought — 分析用户意图
    // ═══════════════════════════════════════════════════════
    const thought = analyzeIntent(safeMessage);

    // ═══════════════════════════════════════════════════════
    //  ReAct Step 2: Action — RAG 知识库检索
    // ═══════════════════════════════════════════════════════
    let contextText = '';
    let chunksCount = 0;
    try {
      const result = await retrieveRelevantChunks(safeMessage, 3);
      chunksCount = result.chunks.length;
      if (chunksCount > 0) {
        contextText = result.chunks
          .map((chunk, i) => `[${i + 1}] ${chunk.title}\n${chunk.content}`)
          .join('\n\n');
      }
    } catch (error) {
      console.warn('[Chat] Retrieval failed, proceeding without context:', error);
    }

    // ═══════════════════════════════════════════════════════
    //  ReAct Step 3: MCP 工具调用（增强检索）
    // ═══════════════════════════════════════════════════════
    let mcpContext = '';
    try {
      mcpContext = await runMCPForQuery(safeMessage);
      if (mcpContext) {
        console.log(`[Chat] MCP context length: ${mcpContext.length}`);
      }
    } catch (error) {
      console.warn('[Chat] MCP call failed, proceeding without MCP context:', error);
    }

    // ═══════════════════════════════════════════════════════
    //  ReAct Step 4: Observation — Memory 上下文构建
    // ═══════════════════════════════════════════════════════
    let memoryContext;
    try {
      memoryContext = conversationId
        ? await buildMemoryContext(conversationId, safeMessage)
        : { summary: '', recentMessages: history, overflowCount: 0, totalTokens: 0 };
    } catch (error) {
      console.warn('[Chat] Memory build failed, fallback to raw history:', error);
      memoryContext = { summary: '', recentMessages: history, overflowCount: 0, totalTokens: 0 };
    }

    // ── 组装 System Prompt ─────────────────────────────────
    const summaryBlock = memoryContext.summary
      ? `【历史对话摘要】\n${memoryContext.summary}\n\n`
      : '';

    const mcpBlock = mcpContext
      ? `【MCP 工具检索结果】\n${mcpContext}\n\n`
      : '';

    const systemContent = `${SYSTEM_PROMPT}\n\n${summaryBlock}${mcpBlock}${contextText ? `以下是相关项目文档供参考：\n${contextText}` : ''}`;

    const systemMessage: Message = { role: 'system', content: systemContent };

    const messages: Message[] = [
      systemMessage,
      ...memoryContext.recentMessages,
      { role: 'user', content: message },
    ];

    console.log(
      `[Chat] ReAct assembled: thought="${thought.slice(0, 40)}...", ` +
        `chunks=${chunksCount}, mcp=${mcpContext ? 'yes' : 'no'}, ` +
        `summary=${memoryContext.summary ? 'yes' : 'no'}, ` +
        `overflow=${memoryContext.overflowCount}, estTokens=${memoryContext.totalTokens}`
    );

    // ═══════════════════════════════════════════════════════
    //  SSE 流式输出阶段 — 按 ReAct 顺序发送事件
    // ═══════════════════════════════════════════════════════
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let isClientDisconnected = false;
    req.on('close', () => {
      isClientDisconnected = true;
    });

    // Step 1: Thought
    sendEvent(res, { type: 'thought', content: thought, step: 1 });

    // Step 2: Tool Call
    sendEvent(res, {
      type: 'tool_call',
      name: 'retrieveRelevantChunks',
      input: safeMessage,
    });

    // Step 3: Tool Result
    sendEvent(res, {
      type: 'tool_result',
      name: 'retrieveRelevantChunks',
      output: `命中 ${chunksCount} 条相关文档${contextText ? '，已注入上下文' : '，未找到相关内容'}`,
    });

    // Step 4: 模型路由 — 根据复杂度选择模型
    const complexity = classifyComplexity(
      safeMessage,
      memoryContext.recentMessages.length,
      chunksCount
    );
    const selectedModel = selectModel(complexity);

    console.log(
      `[Chat] Model routing: complexity=${complexity}, model=${selectedModel}`
    );

    // Step 5: Content — 流式生成最终回答
    let assistantContent = '';

    try {
      for await (const content of streamChat(messages, selectedModel)) {
        if (isClientDisconnected) break;
        assistantContent += content;
        sendEvent(res, { type: 'content', content });
      }
    } catch (error) {
      if (!isClientDisconnected) {
        console.error('[Chat] Stream error:', error);
        sendEvent(res, { type: 'error', error: 'Generation failed' });
      }
    }

    if (!isClientDisconnected) {
      res.write('data: [DONE]\n\n');
    }

    // ── 写入结果缓存 ────────────────────────────────────────
    if (assistantContent.trim()) {
      setCachedResponse(safeMessage, assistantContent, selectedModel);
    }

    // ── 持久化 assistant 回复 ────────────────────────────────
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
