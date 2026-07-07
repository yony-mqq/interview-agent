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

## 三、MCP 核心概念

### 1. Tool（工具）

让 LLM 执行动作（计算、查询、调用 API）。

```typescript
interface MCPTool {
  name: string;           // 工具名称
  description: string;    // 工具描述（LLM 靠这个决定要不要调用）
  inputSchema: {          // 参数 Schema（JSON Schema）
    type: 'object';
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    };
    required: ['query'];
  };
}
```

### 2. Resource（资源）

暴露只读数据（文档、数据库记录）。

### 3. Prompt（提示模板）

预定义的 Prompt 模板，供 Client 复用。

**我们的项目只实现了 Tool，因为面试场景下 Tool 最有价值。**

---

## 四、协议通信流程

### Step 1: Client 请求工具列表

```http
GET /mcp/tools

Response:
{
  "server": { "name": "interview-agent-mcp", "version": "1.0.0" },
  "tools": [
    {
      "name": "search_resume",
      "description": "语义搜索简历知识库...",
      "inputSchema": { "type": "object", "properties": { "query": {...} }, "required": ["query"] }
    },
    {
      "name": "get_tech_stack",
      "description": "获取候选人的完整技术栈...",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ]
}
```

### Step 2: Client 调用工具

```http
POST /mcp/tools/call
Content-Type: application/json

{
  "name": "search_resume",
  "arguments": {
    "query": "项目经验",
    "topK": 3
  }
}

Response:
{
  "content": [
    { "type": "text", "text": "[1] 接送列表架构\nSSR + CSR..." }
  ]
}
```

### Step 3: 结果注入 LLM 上下文

工具返回的文本塞入 System Prompt，LLM 基于这些内容生成回答。

---

## 五、项目中实现的 5 个 MCP 工具

| 工具名 | 作用 | 对应面试问题 |
|---|---|---|
| `search_resume` | 语义搜索知识库 | "说说你的项目"、开放性问题 |
| `get_tech_stack` | 获取技术栈 | "你的技术栈是什么" |
| `get_project_experience` | 获取项目详情 | "介绍一下接送列表" |
| `get_performance_metrics` | 获取性能数据 | "秒开率优化了多少" |
| `get_stability_achievements` | 获取稳定性成果 | "稳定性建设做了什么" |

---

## 六、MCP 在 chat 流程中的位置

```
用户输入
  │
  ▼
ReAct Step 1: Thought（意图分析）
  │
  ▼
ReAct Step 2: RAG 检索（向量相似度）
  │
  ▼
ReAct Step 3: MCP 工具调用（结构化查询） ← 新增
  │   ├─ selectMcpTool(query) → 关键词匹配选工具
  │   ├─ callMCPTool(name, args) → HTTP 调用 Server
  │   └─ 结果注入 System Prompt
  │
  ▼
ReAct Step 4: Memory 上下文构建
  │
  ▼
ReAct Step 5: 组装 System Prompt
  │   [SYSTEM_PROMPT]
  │   [Memory 摘要]
  │   [MCP 工具结果]  ← 新增
  │   [RAG 检索结果]
  │
  ▼
LLM 流式生成回答
```

**MCP 和 RAG 的区别：**

| | RAG | MCP |
|---|---|---|
| 触发方式 | 每次请求自动执行 | 按需选择工具 |
| 检索粒度 | 向量相似度，细粒度 chunk | 结构化查询，整篇文档 |
| 适用场景 | 开放式问题 | 特定领域问题 |
| 精确度 | 可能漏检 | 精准命中 |

**两者互补：** RAG 负责兜底，MCP 负责精准打击。

---

## 七、面试话术

> **"你做过 MCP 吗？和 Function Calling 什么区别？"**
>
> 我在项目里手写了一个轻量级 MCP Server，暴露了 5 个工具：search_resume、get_tech_stack、get_project_experience、get_performance_metrics、get_stability_achievements。
>
> MCP 和 Function Calling 的核心区别是**协议层 vs 实现层**。Function Calling 是 OpenAI 的私有实现，每个模型厂商的 API 格式都不一样。MCP 是 Anthropic 推出的开放协议，把工具的定义和实现从模型中解耦出来——MCP Server 统一暴露工具，任何支持 MCP 的 Client 都能调用。
>
> 我们的实现没有引入官方 SDK，而是基于 Express 手写 HTTP 路由，GET /mcp/tools 返回工具列表，POST /mcp/tools/call 执行工具调用。这样面试时能完整讲清楚 MCP 的协议原理，而不是只会调 SDK。
>
> 在 chat 流程中，MCP 放在 RAG 之后、LLM 生成之前。先通过关键词规则匹配选择最合适的工具，调用后把结果注入 System Prompt。MCP 和 RAG 是互补的：RAG 做细粒度语义检索，MCP 做结构化领域查询。

---

## 八、一句话总结

> **MCP 是 AI 世界的 USB 接口。**
>
> 以前每个设备（模型）有自己的充电口（Function Calling），MCP 让所有人用同一个标准接口，插上去就能用。
