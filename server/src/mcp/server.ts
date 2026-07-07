/**
 * MCP Server — 轻量级 HTTP 实现
 *
 * 基于 Express 路由暴露 MCP 协议接口：
 *   GET  /mcp/tools      → 列出可用工具（对应 MCP tools/list）
 *   POST /mcp/tools/call → 调用工具（对应 MCP tools/call）
 *
 * 不引入 @modelcontextprotocol/sdk，手写 JSON-RPC 风格的 HTTP 接口，
 * 面试时能完整讲清楚 MCP 协议的底层通信机制。
 */
import { Router, Request, Response } from 'express';
import { MCP_TOOLS } from './tools.js';
import type { MCPToolCall } from './types.js';

const router = Router();

/**
 * GET /mcp/tools
 * 列出所有可用工具及其 JSON Schema 定义。
 *
 * 对应 MCP 协议的 tools/list 方法。
 */
router.get('/tools', (_req: Request, res: Response) => {
  res.json({
    server: {
      name: 'interview-agent-mcp',
      version: '1.0.0',
    },
    tools: MCP_TOOLS.map((t) => t.definition),
  });
});

/**
 * POST /mcp/tools/call
 * 调用指定工具，传入参数，返回结果。
 *
 * 对应 MCP 协议的 tools/call 方法。
 * 请求体: { name: string, arguments: Record<string, unknown> }
 * 响应体: { content: [{ type: 'text', text: string }], isError?: boolean }
 */
router.post('/tools/call', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, arguments: args } = req.body as MCPToolCall;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Tool name is required' });
      return;
    }

    const tool = MCP_TOOLS.find((t) => t.definition.name === name);
    if (!tool) {
      res.status(404).json({
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      });
      return;
    }

    console.log(`[MCP Server] Calling tool "${name}" with args:`, args || {});

    const result = await tool.handler(args || {});

    console.log(`[MCP Server] Tool "${name}" result length: ${result.content[0]?.text.length || 0}`);

    res.json(result);
  } catch (error) {
    console.error('[MCP Server] Tool call error:', error);
    res.status(500).json({
      content: [
        { type: 'text', text: `Tool execution failed: ${(error as Error).message}` },
      ],
      isError: true,
    });
  }
});

export default router;
