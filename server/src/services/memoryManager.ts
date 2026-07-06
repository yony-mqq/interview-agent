/**
 * Memory 管理器
 *
 * 核心职责：
 * 1. 滑动窗口：从最新消息往前累加 token，超出预算即截断
 * 2. 摘要触发：当溢出消息累积到一定阈值时，调用 LLM 生成摘要
 * 3. 预算分配：在 System Prompt / 摘要 / 近期对话 / 当前输入之间分配 token
 */
import type { Message } from '../types/index.js';
import { estimateTokens, estimateMessagesTokens } from './tokenEstimator.js';
import { getSummary, upsertSummary, generateSummary } from './summaryService.js';
import { getHistoryMessages } from './messageService.js';

/** 上下文总预算（含生成预留） */
const TOTAL_CONTEXT_BUDGET = 4000;

/** System Prompt + 知识库上下文预留 token */
const SYSTEM_PROMPT_RESERVE = 1200;

/** 当前用户输入预留 token */
const CURRENT_INPUT_RESERVE = 500;

/** 滑动窗口可用预算 = 总预算 - system - 当前输入 */
const SLIDING_WINDOW_BUDGET = TOTAL_CONTEXT_BUDGET - SYSTEM_PROMPT_RESERVE - CURRENT_INPUT_RESERVE;

/** 摘要最大 token 预算 */
const SUMMARY_BUDGET = 500;

/** 触发摘要生成的最小溢出 token 数 */
const SUMMARY_TRIGGER_THRESHOLD = 800;

/** 触发摘要生成的最小溢出消息数 */
const SUMMARY_TRIGGER_MESSAGES = 4;

export interface MemoryContext {
  /** 注入 system prompt 的摘要文本 */
  summary: string;
  /** 滑动窗口内的近期完整对话 */
  recentMessages: Message[];
  /** 被摘要覆盖的溢出消息数量 */
  overflowCount: number;
  /** 当前上下文总 token 估算 */
  totalTokens: number;
}

/**
 * 构建 Memory 上下文
 *
 * 流程：
 * 1. 读取全部历史 + 现有摘要
 * 2. 用滑动窗口从后往前填充，直到预算用完
 * 3. 溢出消息若达到阈值，生成新摘要并持久化
 * 4. 返回 { summary, recentMessages } 供 chat.ts 组装 messages
 */
export async function buildMemoryContext(
  conversationId: string,
  currentInput: string
): Promise<MemoryContext> {
  // 1. 读取全部历史（不再限制 50 条，让滑动窗口自己决定）
  const allHistory = getHistoryMessages(conversationId, 200);

  // 2. 读取现有摘要
  const existingSummary = getSummary(conversationId);
  let summary = existingSummary?.summary || '';
  let summaryTokens = estimateTokens(summary);

  // 3. 计算滑动窗口预算（摘要占预算的一部分）
  const currentInputTokens = estimateTokens(currentInput);
  const availableWindowBudget =
    TOTAL_CONTEXT_BUDGET - SYSTEM_PROMPT_RESERVE - currentInputTokens - Math.min(summaryTokens, SUMMARY_BUDGET);

  // 4. 滑动窗口算法：从最新消息往前累加
  const { recentMessages, overflowMessages } = buildSlidingWindow(
    allHistory,
    Math.max(availableWindowBudget, 500) // 至少保留 500 token 的窗口
  );

  // 5. 溢出消息达到阈值 → 生成新摘要
  const overflowTokens = estimateMessagesTokens(overflowMessages);
  if (
    overflowMessages.length >= SUMMARY_TRIGGER_MESSAGES &&
    overflowTokens >= SUMMARY_TRIGGER_THRESHOLD
  ) {
    try {
      const newSummary = await generateSummary(overflowMessages);
      if (newSummary) {
        // 合并旧摘要 + 新摘要（如果已有）
        summary = existingSummary
          ? `${existingSummary.summary}\n\n【新增】${newSummary}`
          : newSummary;

        // 摘要本身也可能超长，截断到预算内
        if (estimateTokens(summary) > SUMMARY_BUDGET) {
          summary = await compressSummary(summary);
        }

        upsertSummary(
          conversationId,
          summary,
          (existingSummary?.message_count || 0) + overflowMessages.length,
          estimateTokens(summary)
        );
        summaryTokens = estimateTokens(summary);
      }
    } catch (error) {
      console.warn('[Memory] Summary generation failed, using existing summary:', error);
    }
  }

  // 6. 计算最终总 token
  const totalTokens =
    SYSTEM_PROMPT_RESERVE +
    Math.min(summaryTokens, SUMMARY_BUDGET) +
    estimateMessagesTokens(recentMessages) +
    currentInputTokens;

  return {
    summary,
    recentMessages,
    overflowCount: allHistory.length - recentMessages.length,
    totalTokens,
  };
}

/**
 * 滑动窗口：从最新消息往前累加 token，超出预算即归入 overflow
 */
function buildSlidingWindow(
  history: Message[],
  budget: number
): { recentMessages: Message[]; overflowMessages: Message[] } {
  const recent: Message[] = [];
  const overflow: Message[] = [];
  let used = 0;

  // 从后往前遍历（最新消息 → 最旧消息）
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (used + tokens <= budget) {
      recent.unshift(history[i]); // 保持正序
      used += tokens;
    } else {
      overflow.unshift(history[i]);
    }
  }

  return { recentMessages: recent, overflowMessages: overflow };
}

/**
 * 摘要超长时，调用 LLM 压缩到预算内
 */
async function compressSummary(summary: string): Promise<string> {
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      timeout: 15000,
    });

    const response = await client.chat.completions.create({
      model: 'qwen-turbo',
      messages: [
        {
          role: 'system',
          content: '请将以下对话摘要压缩到 150 字以内，保留所有关键信息：',
        },
        { role: 'user', content: summary },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content?.trim() || summary.slice(0, 300);
  } catch {
    return summary.slice(0, 300);
  }
}

/**
 * 快速估算：当前请求组装后的总 token（不含响应）
 * 供外部做前置检查
 */
export function estimateContextTokens(
  systemPrompt: string,
  summary: string,
  history: Message[],
  currentInput: string
): number {
  return (
    estimateTokens(systemPrompt) +
    estimateTokens(summary) +
    estimateMessagesTokens(history) +
    estimateTokens(currentInput)
  );
}
