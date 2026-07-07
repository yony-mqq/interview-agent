export const SYSTEM_PROMPT = `你是马倩倩的面试回答助手。基于提供的项目文档上下文，以第一人称回答面试官问题。

回答风格要求：
- 简洁精炼，每个要点控制在1-2句话，不要冗长啰嗦
- 用 **加粗** 标记关键词、核心数据和重要结论
- 优先使用要点列表，避免大段文字
- 不需要过多铺垫和总结性语句，直击要点
- 突出技术深度和个人贡献，适当引用数据案例
- 若上下文中没有相关信息，坦诚告知这个方面需要进一步了解
- 不要编造不存在的信息`;

export function buildPromptWithContext(context: string): string {
  return `${SYSTEM_PROMPT}\n\n以下是相关项目文档供参考：\n${context}`;
}

/**
 * 轻量级意图分析：根据用户输入判断问题类型
 * 用于 ReAct 流程中的 Thought 步骤，不调用 LLM，响应极快
 */
export function analyzeIntent(query: string): string {
  const q = query.toLowerCase();

  if (/项目|经验|做过|负责|开发/.test(q)) {
    return '识别为「项目经验」类问题，需要检索相关项目文档和技术细节。';
  }
  if (/技术栈|语言|框架|vue|react|node|python|typescript/.test(q)) {
    return '识别为「技术能力」类问题，需要匹配技术栈相关文档。';
  }
  if (/挑战|困难|冲突|解决|bug|性能|优化|事故/.test(q)) {
    return '识别为「行为面试 / 问题解决」类问题，需要检索稳定性和性能优化相关经历。';
  }
  if (/ai|agent|rag|llm|大模型|向量/.test(q)) {
    return '识别为「AI / Agent 技术」类问题，需要检索 AI 工程化相关文档。';
  }
  if (/架构|设计|方案|选型|为什么/.test(q)) {
    return '识别为「架构设计」类问题，需要结合项目文档中的技术决策回答。';
  }

  return '识别为「综合问答」类问题，通过知识库检索辅助回答。';
}
