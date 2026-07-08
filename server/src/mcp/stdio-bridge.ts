/**
 * MCP stdio 桥接器
 *
 * 原理：把 stdio transport 的 JSON-RPC 请求桥接到 HTTP Server。
 *
 * ┌─────────────┐      stdin/stdout      ┌─────────────┐      HTTP       ┌─────────────┐
 * │  Cursor     │ ─────────────────────► │ 本桥接器     │ ─────────────► │ MCP HTTP    │
 * │  Claude Code│  JSON-RPC 2.0          │ (stdio      │  fetch        │ Server      │
 * │  等工具     │ ◄───────────────────── │  bridge)    │ ◄──────────── │ (/mcp/...)  │
 * └─────────────┘                        └─────────────┘               └─────────────┘
 *
 * 为什么需要桥接？
 * ─────────────────
 * MCP 官方协议支持两种 transport：
 *   1. stdio：Client 启动 Server 作为子进程，通过 stdin/stdout 通信
 *   2. HTTP：直接 HTTP 请求/响应
 *
 * Cursor、Claude Desktop、Claude Code 等工具默认只支持 stdio 方式。
 * 我们的 MCP Server 是 HTTP 实现，所以需要这个桥接器做协议转换。
 *
 * JSON-RPC 格式：
 *   Request:  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
 *   Request:  {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"...","arguments":{}}}
 *   Response: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
 *
 * 关键约束：stdout 只能输出 JSON-RPC 响应，日志必须输出到 stderr。
 */
import { createInterface } from 'readline';

const MCP_HTTP_URL = process.env.MCP_HTTP_URL || 'http://localhost:3001';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * 发送 JSON-RPC 响应到 stdout
 * 注意：只能用 console.log（stdout），不能用 console.error
 */
function sendResponse(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * 发送错误响应
 */
function sendError(id: number | string | null, code: number, message: string): void {
  sendResponse({ jsonrpc: '2.0', id, error: { code, message } });
}

/**
 * 处理 tools/list 请求
 */
async function handleToolsList(id: number | string): Promise<void> {
  try {
    const response = await fetch(`${MCP_HTTP_URL}/mcp/tools`);
    if (!response.ok) {
      sendError(id, -32603, `HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    sendResponse({ jsonrpc: '2.0', id, result: data });
  } catch (error) {
    sendError(id, -32603, `Network error: ${(error as Error).message}`);
  }
}

/**
 * 处理 tools/call 请求
 */
async function handleToolsCall(
  id: number | string,
  params: Record<string, unknown>
): Promise<void> {
  try {
    const response = await fetch(`${MCP_HTTP_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      sendError(id, -32603, `HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    sendResponse({ jsonrpc: '2.0', id, result: data });
  } catch (error) {
    sendError(id, -32603, `Network error: ${(error as Error).message}`);
  }
}

/**
 * 主循环：逐行读取 stdin，解析 JSON-RPC，分发处理
 */
async function main() {
  // 所有日志输出到 stderr，避免污染 stdout（stdout 专用于 JSON-RPC）
  console.error(`[MCP Bridge] stdio bridge started`);
  console.error(`[MCP Bridge] Target: ${MCP_HTTP_URL}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch {
      console.error('[MCP Bridge] Invalid JSON:', trimmed.slice(0, 200));
      sendError(null, -32700, 'Parse error');
      continue;
    }

    // 校验 JSON-RPC 格式
    if (request.jsonrpc !== '2.0') {
      sendError(request.id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
      continue;
    }

    console.error(`[MCP Bridge] ← ${request.method} (id=${request.id})`);

    // 分发到对应 handler
    switch (request.method) {
      case 'tools/list':
        await handleToolsList(request.id);
        break;

      case 'tools/call':
        await handleToolsCall(request.id, (request.params as Record<string, unknown>) || {});
        break;

      default:
        sendError(request.id, -32601, `Method not found: ${request.method}`);
    }
  }

  console.error('[MCP Bridge] stdin closed, exiting');
}

main().catch((err) => {
  console.error('[MCP Bridge] Fatal error:', err);
  process.exit(1);
});
