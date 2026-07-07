/**
 * MCP Client — 被 chat.ts 调用
 *
 * 职责：
 * 1. 列出可用 MCP 工具（用于注入 System Prompt）
 * 2. 根据用户问题智能选择最合适的工具并调用
 * 3. 把工具返回结果作为上下文注入 LLM
 *
 * 选型策略：基于关键词规则匹配，不额外调用 LLM，零成本、低延迟。
 */
import type { MCPToolResult } from './types.js';

const MCP_BASE_URL = 'http://localhost:3001';

interface ToolInfo {
  name: string;
  description: string;
}

interface ToolSelection {
  name: string;
  args: Record<string, unknown>;
}

/**
 * 列出所有可用的 MCP 工具
 */
export async function listMCPTools(): Promise<ToolInfo[]> {
  try {
    const response = await fetch(`${MCP_BASE_URL}/mcp/tools`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { tools: ToolInfo[] };
    return data.tools || [];
  } catch (error) {
    console.warn('[MCP Client] Failed to list tools:', error);
    return [];
  }
}

/**
 * 调用指定 MCP 工具
 */
export async function callMCPTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<MCPToolResult> {
  try {
    const response = await fetch(`${MCP_BASE_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as MCPToolResult;
  } catch (error) {
    console.error(`[MCP Client] Tool "${name}" failed:`, error);
    return {
      content: [{ type: 'text', text: `调用工具失败: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

/**
 * 根据用户问题智能选择最合适的 MCP 工具
 *
 * 策略：关键词规则匹配，宁可多调也不要漏调。
 * 复杂/开放问题 → search_resume（语义搜索）
 * 特定领域问题 → 对应专项工具
 */
export function selectMcpTool(query: string): ToolSelection | null {
  const q = query.toLowerCase();

  // 技术栈类 → get_tech_stack
  if (/技术栈|前端框架|vue|react|rax|语言|webpack|vite/.test(q)) {
    return { name: 'get_tech_stack', args: {} };
  }

  // 性能优化类 → get_performance_metrics
  if (/性能|秒开|ssr|csr|优化|加载|首屏|预请求/.test(q)) {
    return { name: 'get_performance_metrics', args: {} };
  }

  // 稳定性类 → get_stability_achievements
  if (/稳定性|监控|告警|js error|故障|排查|线上问题/.test(q)) {
    return { name: 'get_stability_achievements', args: {} };
  }

  // 特定项目类 → get_project_experience
  if (/项目|经验|做过|负责|架构|new-list|接送|汽车票| Harness/.test(q)) {
    const projectMatch = q.match(/(接送|稳定|性能|Harness|组件)/);
    return {
      name: 'get_project_experience',
      args: projectMatch ? { projectName: projectMatch[1] } : {},
    };
  }

  // 开放性问题 → search_resume（兜底，语义搜索）
  if (/说说|介绍|聊聊|分享|怎么/.test(q) || q.length > 15) {
    return { name: 'search_resume', args: { query: q.slice(0, 50) } };
  }

  // 简单问候/确认 → 不需要调用工具
  return null;
}

/**
 * 一键执行 MCP 流程：选择工具 → 调用 → 返回文本结果
 */
export async function runMCPForQuery(query: string): Promise<string> {
  const selection = selectMcpTool(query);
  if (!selection) return '';

  console.log(`[MCP Client] Selected tool: ${selection.name} for query: "${query.slice(0, 40)}..."`);

  const result = await callMCPTool(selection.name, selection.args);
  if (result.isError) {
    console.warn(`[MCP Client] Tool ${selection.name} returned error`);
    return '';
  }

  return result.content.map((c) => c.text).join('\n');
}
