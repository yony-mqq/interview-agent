/**
 * MCP (Model Context Protocol) 轻量类型定义
 *
 * 不引入 @modelcontextprotocol/sdk 重依赖，手写核心类型，
 * 面试时能讲清楚每一行代码的协议含义。
 */

/** MCP Tool 定义（JSON Schema 风格） */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP Tool 调用请求 */
export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** MCP Tool 调用结果 */
export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** MCP Server 能力声明 */
export interface MCPServerCapabilities {
  tools: { listChanged?: boolean };
}

/** MCP Server 初始化响应 */
export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: MCPServerCapabilities;
}
