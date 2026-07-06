/**
 * Token 估算器
 *
 * 采用轻量级字符级估算，不依赖 tiktoken，适合中文面试场景：
 * - CJK 字符（中/日/韩）≈ 1 token/字
 * - 英文/数字/符号 ≈ 0.25 token/字
 *
 * 估算精度足以支撑滑动窗口和预算控制，后续可接入 tiktoken 做精确统计。
 */

const CJK_REGEX = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g;

/**
 * 估算单条文本的 token 数量
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = (text.match(CJK_REGEX) || []).length;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount + nonCjkCount * 0.25);
}

/**
 * 估算消息列表的总 token 数
 */
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}
