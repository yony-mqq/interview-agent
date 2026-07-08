# MCP（Model Context Protocol）协议详解

> **面试高频题**："你做过 MCP 吗？MCP 和 Function Calling 有什么区别？"
> **考点2 强调**："MCP 是区分度很高的新技术点。"

---

## 一、MCP 是什么

MCP = Model Context Protocol（模型上下文协议），由 Anthropic 推出。

**一句话：让 LLM 应用通过标准化接口调用外部工具和数据源。**

### 为什么需要 MCP？

以前每个 AI 应用对接外部工具的方式都不一样：
- OpenAI 用 Function Calling
- Claude 用 Tool Use
- LangChain 用自定义 Tool 类

**MCP 统一了这些：** 不管是 Claude、GPT、还是国产大模型，只要支持 MCP，就能调用同一个 MCP Server 暴露的工具。

```
┌─────────────────────────────────────────────────────┐
│                    MCP 架构                           │
├─────────────────────────────────────────────────────┤
│                                                      │
│   ┌─────────────┐      MCP 协议       ┌──────────┐ │
│   │   Claude    │ ◄────────────────► │ MCP      │ │
│   │   ChatGPT   │   JSON-RPC / HTTP  │ Server   │ │
│   │   通义千问   │                    │          │ │
│   │   ...       │                    │ • Tools  │ │
│   └─────────────┘                    │ • Resources│
│         ▲                            │ • Prompts│ │
│         │                            └──────────┘ │
│    MCP Client                        │              │
│                                      │              │
│                                      ▼              │
│                              ┌──────────────┐      │
│                              │ 简历知识库    │      │
│                              │ 数据库        │      │
│                              │ API 服务      │      │
│                              └──────────────┘      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 二、MCP 和 Function Calling 的区别

| 对比项 | Function Calling | MCP |
|---|---|---|
| **定位** | 模型原生的工具调用能力 | 跨模型的标准化协议 |
| **厂商绑定** | OpenAI 原生，其他模型兼容但不一致 | 任何模型/框架都可用 |
| **工具定义** | 每个应用自己定义 | MCP Server 统一定义，多个 Client 复用 |
| **通信方式** | 内嵌在模型 API 中 | JSON-RPC over HTTP / stdio |
| **生态** | 各自为战 | 一个 Server 供多个 Client 用 |

**面试话术：**

> "Function Calling 是 OpenAI 的私有实现，其他模型虽然也有类似能力，但 API 格式不统一。MCP 是 Anthropic 推出的开放协议，把'工具定义'和'工具实现'从模型中解耦出来——工具由 MCP Server 统一暴露，任何支持 MCP 的 Client（Claude、GPT、通义千问）都能调用。我们项目里手写了一个轻量级 MCP Server，不引入官方 SDK，但能完整展示协议原理。"

---

## 三、MCP 协议原理（大白话版）

MCP 本质就是**一套"工具广告 + 工具调用"的标准格式**。

想象你去餐厅吃饭：

```
Function Calling（OpenAI 方式）：
  你（Client）直接走进厨房，跟厨师（LLM）说："我要做宫保鸡丁"
  厨师说："好，你帮我去拿鸡肉、花生、辣椒"
  → 你们俩私下约定了一套暗号，别的餐厅（模型）听不懂

MCP（标准化方式）：
  餐厅门口挂了一个菜单（GET /mcp/tools）：
    - 宫保鸡丁：需要鸡肉、花生、辣椒
    - 水煮鱼：需要鱼片、豆芽、花椒

  你看着菜单点菜（POST /mcp/tools/call）：
    "我要宫保鸡丁，参数是：鸡肉200g、花生50g"

  厨房（MCP Server）做好菜端出来
  → 任何顾客（任何模型/工具）都能看懂这个菜单
```

**协议就两步：**
1. **看菜单**（`GET /mcp/tools`）→ 返回每个工具的名字、描述、需要什么参数
2. **点菜**（`POST /mcp/tools/call`）→ 传工具名 + 参数，返回结果

---

## 四、实现过程逐行拆解

### Server 端（`server/src/mcp/server.ts`）

```typescript
// 第 23 行：看菜单接口
router.get('/tools', (_req, res) => {
  res.json({
    server: { name: 'interview-agent-mcp', version: '1.0.0' },
    tools: MCP_TOOLS.map((t) => t.definition),  // ← 把 5 个工具的定义暴露出去
  });
});
```

**这行在做什么？** 当有人（或代码）访问 `GET /mcp/tools`，返回一个 JSON：
```json
{
  "server": { "name": "interview-agent-mcp", "version": "1.0.0" },
  "tools": [
    {
      "name": "get_tech_stack",
      "description": "获取候选人的完整技术栈...",
      "inputSchema": { "type": "object", "properties": {} }
    },
    {
      "name": "search_resume",
      "description": "语义搜索简历知识库...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "搜索关键词" }
        },
        "required": ["query"]
      }
    }
  ]
}
```

**为什么要有 `inputSchema`？** 这是告诉调用方："我这个工具需要什么参数，每个参数是什么类型"。这样调用方（不管是 LLM 还是人）知道该怎么传参。

---

```typescript
// 第 41 行：点菜接口
router.post('/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body;

  // 1. 根据 name 找到对应的工具
  const tool = MCP_TOOLS.find((t) => t.definition.name === name);

  // 2. 执行工具 handler（就是具体的业务逻辑）
  const result = await tool.handler(args);

  // 3. 返回结果
  res.json(result);
});
```

**这行在做什么？** 收到 `POST /mcp/tools/call`，请求体是：
```json
{
  "name": "get_tech_stack",
  "arguments": {}
}
```

然后找到 `get_tech_stack` 这个工具，执行它的 handler（去读 `01-个人概述.md`），返回：
```json
{
  "content": [
    { "type": "text", "text": "核心框架：React、Vue、Rax..." }
  ]
}
```

### Client 端（`server/src/mcp/client.ts`）

```typescript
// 一键执行 MCP 流程
export async function runMCPForQuery(query: string): Promise<string> {
  // Step 1: 根据用户问题，判断该用哪个工具
  const selection = selectMcpTool(query);
  // 比如用户问"你的技术栈是什么" → 返回 { name: 'get_tech_stack', args: {} }

  // Step 2: 发 HTTP POST 调用工具
  const result = await callMCPTool(selection.name, selection.args);
  // 就是 fetch('http://localhost:3001/mcp/tools/call', { body: JSON.stringify({ name, arguments }) })

  // Step 3: 把结果文本返回
  return result.content.map((c) => c.text).join('\n');
}
```

**这里有个关键点：** `selectMcpTool()` 不是 LLM 来判断的，而是**规则匹配**：
```typescript
if (/技术栈|前端框架|vue|react/.test(q)) {
  return { name: 'get_tech_stack', args: {} };
}
```

**为什么不用 LLM 判断？**
1. 省一次 API 调用（省钱）
2. 面试问题类型相对固定，规则足够覆盖
3. 延迟更低

---

## 五、项目中的完整调用链路

当用户输入"你的技术栈是什么"，chat.ts 里的执行顺序：

```
1. 用户输入："你的技术栈是什么"
   │
   ▼
2. chat.ts: 调用 runMCPForQuery("你的技术栈是什么")
   │
   ▼
3. client.ts: selectMcpTool("你的技术栈是什么")
   │   └─ 正则匹配到 /技术栈/ → 返回 { name: 'get_tech_stack', args: {} }
   │
   ▼
4. client.ts: callMCPTool('get_tech_stack', {})
   │   └─ fetch POST http://localhost:3001/mcp/tools/call
   │       body: { "name": "get_tech_stack", "arguments": {} }
   │
   ▼
5. server.ts: 收到 POST /mcp/tools/call
   │   └─ 找到 get_tech_stack → 执行 handler
   │   └─ handler 读取 knowledge/01-个人概述.md
   │   └─ 返回 { "content": [{ "type": "text", "text": "React, Vue, Rax..." }] }
   │
   ▼
6. client.ts: 拿到结果文本 "React, Vue, Rax..."
   │
   ▼
7. chat.ts: 把 MCP 结果注入 System Prompt
   │   组装成：
   │   【MCP 工具检索结果】
   │   React, Vue, Rax...
   │
   ▼
8. chat.ts: 调用 LLM（qwen-plus）生成最终回答
   │   LLM 看到 System Prompt 里有 MCP 结果，基于它组织语言
   │
   ▼
9. SSE 流式输出："我的前端技术栈主要是 React、Vue 和 Rax..."
```

**MCP 结果在 System Prompt 里的位置：**

```typescript
const systemContent = `
你是马倩倩的面试回答助手...

【历史对话摘要】
...

【MCP 工具检索结果】  ← 新增
React, Vue, Rax...

以下是相关项目文档供参考：
[1] 接送列表架构
...
`;
```

---

## 六、项目中实现的 5 个 MCP 工具

| 工具名 | 作用 | 对应面试问题 |
|---|---|---|
| `search_resume` | 语义搜索知识库 | "说说你的项目"、开放性问题 |
| `get_tech_stack` | 获取技术栈 | "你的技术栈是什么" |
| `get_project_experience` | 获取项目详情 | "介绍一下接送列表" |
| `get_performance_metrics` | 获取性能数据 | "秒开率优化了多少" |
| `get_stability_achievements` | 获取稳定性成果 | "稳定性建设做了什么" |

---

## 七、MCP 和 RAG 的区别

| | RAG | MCP |
|---|---|---|
| 触发方式 | 每次请求自动执行 | 按需选择工具 |
| 检索粒度 | 向量相似度，细粒度 chunk | 结构化查询，整篇文档 |
| 适用场景 | 开放式问题 | 特定领域问题 |
| 精确度 | 可能漏检 | 精准命中 |

**两者互补：** RAG 负责兜底，MCP 负责精准打击。

---

## 八、外部工具兼容性（诚实回答）

### 核心问题：别的编码工具能不能直接用？

**答案是：不能直接用。**

MCP 官方协议支持两种传输方式：

| 方式 | 原理 | 我们的实现 | 主流工具支持 |
|---|---|---|---|
| **stdio** | 子进程 + 标准输入输出 | ❌ 没有 | ✅ Cursor、Claude Desktop、Claude Code 都支持 |
| **HTTP** | HTTP 请求/响应 | ✅ 有 | ⚠️ 少数工具支持 |

我们的实现是 **HTTP 方式**，但 Cursor、Claude Code 等工具**默认只支持 stdio 方式**。

### 如果要让 Cursor 能用，需要改什么？

**方案：stdio 桥接（已落地）**

我们已经实现了完整的 stdio 桥接器：`server/src/mcp/stdio-bridge.ts`。

#### 为什么需要桥接？

MCP 官方协议支持两种 transport：

| 方式 | 原理 | 我们的实现 | 主流工具支持 |
|---|---|---|---|
| **stdio** | Client 启动 Server 作为子进程，通过 stdin/stdout 通信 | ✅ 桥接器 | ✅ Cursor、Claude Desktop、Claude Code |
| **HTTP** | 直接 HTTP 请求/响应 | ✅ 原生 | ⚠️ 少数工具支持 |

Cursor 等工具的工作方式是：
1. 启动一个子进程（比如 `node ./dist/mcp/stdio-bridge.js`）
2. 向子进程的 **stdin** 写入 JSON-RPC 请求
3. 从子进程的 **stdout** 读取 JSON-RPC 响应

我们的 MCP Server 是 HTTP 实现，所以桥接器做的就是 **协议转换**：

```
┌─────────────┐      stdin/stdout      ┌─────────────┐      HTTP       ┌─────────────┐
│  Cursor     │ ─────────────────────► │ 本桥接器     │ ─────────────► │ MCP HTTP    │
│  Claude Code│  JSON-RPC 2.0          │ (stdio      │  fetch        │ Server      │
│  等工具     │ ◄───────────────────── │  bridge)    │ ◄──────────── │ (/mcp/...)  │
└─────────────┘                        └─────────────┘               └─────────────┘
```

#### JSON-RPC 2.0 格式

stdio transport 用的是 **JSON-RPC 2.0** 协议，不是裸 HTTP：

```
Request:   {"jsonrpc":"2.0","id":1,"method":"tools/list"}
Request:   {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"...","arguments":{}}}
Response:  {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
```

**关键点：**
- 每个请求都有唯一的 `id`，响应必须带相同的 `id`（用于请求-响应匹配）
- `method` 区分操作类型：`tools/list`（看菜单）、`tools/call`（点菜）
- 一行一个 JSON 对象，用 `\n` 分隔

#### 桥接器的三个核心步骤

**Step 1：逐行读取 stdin**
```typescript
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

for await (const line of rl) {
  const request = JSON.parse(line.trim());
  // ...
}
```
用 `readline.createInterface` 逐行读取，因为 JSON-RPC 是一行一个请求。

**Step 2：校验 + 分发**
```typescript
// 校验 JSON-RPC 格式
if (request.jsonrpc !== '2.0') {
  sendError(request.id, -32600, 'Invalid Request');
  continue;
}

// 按 method 分发
switch (request.method) {
  case 'tools/list':
    await handleToolsList(request.id);
    break;
  case 'tools/call':
    await handleToolsCall(request.id, request.params);
    break;
  default:
    sendError(request.id, -32601, `Method not found`);
}
```

**Step 3：转发 HTTP，结果写回 stdout**
```typescript
async function handleToolsList(id: number | string): Promise<void> {
  const response = await fetch('http://localhost:3001/mcp/tools');
  const data = await response.json();
  // 包装成 JSON-RPC 响应格式
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: data
  }) + '\n');
}
```

#### 关键约束：stdout 只能输出 JSON-RPC

这是最容易踩坑的地方：

```typescript
// ❌ 错误：console.log 会污染 stdout
console.log('处理请求中...');  // Cursor 会把这行当 JSON-RPC 解析，直接报错

// ✅ 正确：所有日志必须走 stderr
console.error('处理请求中...');  // stderr 不会被 Cursor 解析

// ✅ 正确：响应只能走 stdout.write
process.stdout.write(JSON.stringify(response) + '\n');
```

桥接器里所有的 `console.error` 都是安全的，因为 stderr 和 stdout 是两个独立的管道。

#### 完整代码（server/src/mcp/stdio-bridge.ts）

```typescript
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

function sendResponse(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id: number | string | null, code: number, message: string): void {
  sendResponse({ jsonrpc: '2.0', id, error: { code, message } });
}

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

async function main() {
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
      sendError(null, -32700, 'Parse error');
      continue;
    }

    if (request.jsonrpc !== '2.0') {
      sendError(request.id ?? null, -32600, 'Invalid Request');
      continue;
    }

    switch (request.method) {
      case 'tools/list':
        await handleToolsList(request.id);
        break;
      case 'tools/call':
        await handleToolsCall(request.id, request.params || {});
        break;
      default:
        sendError(request.id, -32601, `Method not found: ${request.method}`);
    }
  }
}

main().catch((err) => {
  console.error('[MCP Bridge] Fatal error:', err);
  process.exit(1);
});
```

#### 启动方式

```bash
# 方式 1：直接运行（需要 HTTP Server 已启动）
cd server && npx tsx src/mcp/stdio-bridge.ts

# 方式 2：编译后运行
cd server && npm run build && node dist/mcp/stdio-bridge.js
```

#### Cursor 配置示例

在项目根目录创建 `.cursor/mcp.json`：
```json
{
  "mcpServers": {
    "interview-agent": {
      "command": "node",
      "args": ["./server/dist/mcp/stdio-bridge.js"],
      "env": {
        "MCP_HTTP_URL": "http://localhost:3001"
      }
    }
  }
}
```

#### 面试时怎么讲 stdio 桥接

> "我们的 MCP Server 基于 Express 手写 HTTP 路由实现。但 Cursor、Claude Code 等外部工具默认只支持 stdio transport——它们会启动一个子进程，通过 stdin 发 JSON-RPC 请求，从 stdout 读响应。为了兼容这些工具，我实现了一个 stdio 桥接器：逐行读取 stdin 的 JSON-RPC 请求，校验格式后转发到本地 HTTP 接口，再把 HTTP 响应包装成 JSON-RPC 格式写回 stdout。这里有个关键约束——stdout 只能输出 JSON-RPC，所有日志必须走 stderr，否则外部工具会把日志当 JSON 解析直接报错。"

---

## 九、面试话术（完整版）

> **"你做过 MCP 吗？和 Function Calling 什么区别？"**
>
> 我在项目里实现了一个轻量级 MCP Server，暴露了 5 个工具：search_resume、get_tech_stack、get_project_experience、get_performance_metrics、get_stability_achievements。
>
> MCP 和 Function Calling 的核心区别是**协议层 vs 实现层**。Function Calling 是 OpenAI 的私有实现，每个模型厂商的 API 格式都不一样。MCP 是 Anthropic 推出的开放协议，把工具的定义和实现从模型中解耦出来——MCP Server 统一暴露工具，任何支持 MCP 的 Client 都能调用。
>
> 我们的实现没有引入官方 SDK，而是基于 Express 手写 HTTP 路由，GET /mcp/tools 返回工具列表（包括名字、描述、参数 Schema），POST /mcp/tools/call 根据工具名执行对应的 handler。这样面试时能完整讲清楚 MCP 的协议原理——本质上就是"看菜单 + 点菜"两步。
>
> 在 chat 流程中，MCP 放在 RAG 之后、LLM 生成之前。先通过关键词规则匹配选择最合适的工具（比如"技术栈"问题匹配 get_tech_stack），然后发 HTTP 调用，结果注入 System Prompt。MCP 和 RAG 是互补的：RAG 做细粒度语义检索，MCP 做结构化领域查询。
>
> 有个局限需要先说明：目前用的是 HTTP transport，而 Cursor、Claude Code 等工具默认只支持 stdio transport，所以还不能直接在这些外部工具中使用。如果要接入，需要加一个 stdio 桥接层。

---

## 十、一句话总结

> **MCP 是 AI 世界的 USB 接口。**
>
> 以前每个设备（模型）有自己的充电口（Function Calling），MCP 让所有人用同一个标准接口，插上去就能用。
