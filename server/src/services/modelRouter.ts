/**
 * 模型路由服务
 *
 * 根据问题复杂度选择模型：
 * - low/medium  → qwen-turbo（成本低，约 qwen-plus 的 1/4）
 * - high        → qwen-plus（能力强，兜底保质量）
 *
 * 分类策略：规则匹配为主，零成本、零延迟。
 * 宁可误判为复杂（多花点 Token），也不要漏判为简单（质量下降）。
 */

export type Complexity = 'low' | 'medium' | 'high';

/**
 * 基于关键词和问句特征快速判断问题复杂度
 *
 * @param query        用户输入
 * @param historyLength 近期对话轮数
 * @param retrievedChunks RAG 检索命中的 chunk 数
 */
export function classifyComplexity(
  query: string,
  historyLength: number,
  retrievedChunks: number
): Complexity {
  const q = query.trim();

  // Rule 1: 问候 / 闲聊 → low
  if (/^(你好|hi|hello|在吗|谢谢|再见|ok|好的)$/i.test(q)) {
    return 'low';
  }

  // Rule 2: 简单确认 / 单字回复 → low
  if (q.length <= 5 && /^(嗯|好|知道|了解|明白|可以|是的|没错)$/i.test(q)) {
    return 'low';
  }

  // Rule 3: 简单 FAQ，短问题且无追问词 → medium
  if (
    /^(什么是|介绍一下|说说你的|你做过|你的技术栈|你的经验)/i.test(q) &&
    q.length < 30 &&
    !/为什么|怎么|如何|详细|具体|深入|原理|底层/i.test(q)
  ) {
    return 'medium';
  }

  // Rule 4: 追问细节词 → high
  if (/为什么|怎么|如何|详细|具体|深入|原理|底层|对比|区别|优劣|选型/i.test(q)) {
    return 'high';
  }

  // Rule 5: 多轮追问（超过 3 轮）→ high
  if (historyLength > 6) {
    // historyLength 是消息数，user+assistant 各算一条，所以 >6 意味着 >3 轮
    return 'high';
  }

  // Rule 6: RAG 没命中（问题很泛，需要通用知识组织）→ medium
  if (retrievedChunks === 0) {
    return 'medium';
  }

  // Rule 7: 长问题（> 50 字）→ high
  if (q.length > 50) {
    return 'high';
  }

  // 默认 medium，保守策略
  return 'medium';
}

/**
 * 根据复杂度选择模型名称
 */
export function selectModel(complexity: Complexity): 'qwen-plus' | 'qwen-turbo' {
  return complexity === 'high' ? 'qwen-plus' : 'qwen-turbo';
}
