# Function Calling 与 Tool Schema 设计

> **面试高频题**："Function Calling 是怎么实现的？Tool Schema 怎么设计？LLM 怎么知道该调哪个工具？"

---

## 一、Function Calling 是什么

Function Calling = LLM 的"动手"能力。

**核心思想**：不是让 LLM 直接回答，而是让 LLM 输出一个 JSON，告诉调用方"我需要调用某某工具，参数是什么"。调用方执行工具后，把结果返回给 LLM，LLM 再基于结果生成最终回答。

```
用户提问 ──► LLM 判断需要调用工具
              │
              ▼
         LLM 输出 JSON：
         {
           "name": "search_resume",
           "arguments": { "query": "项目经验" }
         }
              │
              ▼
         调用方执行 search_resume({"query": "项目经验"})
              │
              ▼
         返回结果给 LLM
              │
              ▼
         LLM 基于结果生成最终回答
```

---

## 二、Tool Schema 怎么设计

Tool Schema 是告诉 LLM "你有什么工具、每个工具做什么、需要什么参数"。

### Schema 结构（OpenAI 格式）

```json
{
  "type": "function",
  "function": {
    "name": "search_resume",
    "description": "语义搜索个人知识库，获取项目经验、技术栈等信息",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "搜索关键词，如'项目经验'、'性能优化'"
        }
      },
      "required": ["query"]
    }
  }
}
```

### 关键字段

| 字段 | 作用 | 设计要点 |
|---|---|---|
| `name` | 工具名 | 用 snake_case，清晰无歧义 |
| `description` | 工具描述 | **最重要**，LLM 靠这个判断用哪个工具 |
| `parameters` | 参数 Schema | 每个参数都要有 `description`，说明干什么用 |
| `required` | 必填参数 | 不写的话 LLM 可能漏传 |

### 面试重点：description 怎么写

**不好的 description**：
```
"description": "搜索简历"
```

**好的 description**：
```
"description": "当用户询问个人项目经验、技术栈、工作成就时调用。
 传入关键词进行语义搜索，返回相关知识库内容。
 如果用户问'做过什么项目'、'技术栈是什么'，必须使用此工具。"
```

**为什么重要？**
- LLM 不是"理解"工具，而是靠 description 做模式匹配
- description 越具体，LLM 选工具越准
- 可以在 description 里写"什么时候用、什么时候不用"

---

## 三、项目中的 Tool 设计

我们项目实现了 5 个工具，对应 5 类高频面试问题：

| 工具名 | description 设计 | 对应面试问题 |
|---|---|---|
| `search_resume` | "语义搜索知识库，用于开放性问题。当用户问'说说你的项目'、'做过什么'时调用" | 开放性问题 |
| `get_tech_stack` | "获取候选人的完整技术栈。当用户问'技术栈'、'用什么框架'时调用" | 技术栈问题 |
| `get_project_experience` | "获取指定项目的详细信息。当用户问'介绍一下接送列表'时调用" | 项目深挖 |
| `get_performance_metrics` | "获取性能优化数据。当用户问'秒开率'、'性能优化了多少'时调用" | 数据类问题 |
| `get_stability_achievements` | "获取稳定性建设成果。当用户问'稳定性'、'线上问题'时调用" | 稳定性问题 |

### 代码示例（`server/src/mcp/server.ts`）

```typescript
export const MCP_TOOLS = [
  {
    definition: {
      name: 'get_tech_stack',
      description: '获取候选人的完整技术栈信息。当面试官询问技术栈、前端框架、使用过什么技术时调用。',
      inputSchema: {
        type: 'object',
        properties: {},  // 不需要参数
      },
    },
    handler: async () => {
      const content = await readKnowledgeFile('01-个人概述.md');
      return { content: [{ type: 'text', text: content }] };
    },
  },
  {
    definition: {
      name: 'search_resume',
      description: '语义搜索个人知识库。当面试官问开放性问题（如"说说你的项目"、"做过什么"）时调用。传入关键词，返回相关知识库内容。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: '搜索关键词，如"项目经验"、"性能优化"、"稳定性建设"' 
          },
        },
        required: ['query'],
      },
    },
    handler: async (args: { query: string }) => {
      // 调用 RAG 检索
      const result = await searchKnowledgeBase(args.query);
      return { content: [{ type: 'text', text: result }] };
    },
  },
];
```

---

## 四、LLM 怎么知道该调哪个工具

### 方式一：让 LLM 自己选（标准 Function Calling）

```typescript
const response = await client.chat.completions.create({
  model: 'qwen-plus',
  messages: [{ role: 'user', content: '你的技术栈是什么' }],
  tools: [  // ← 把工具定义传给 LLM
    { type: 'function', function: { name: 'get_tech_stack', description: '...', parameters: {...} } },
    { type: 'function', function: { name: 'search_resume', description: '...', parameters: {...} } },
  ],
});

// LLM 返回：
// { "name": "get_tech_stack", "arguments": {} }
```

**优点**：灵活，LLM 根据问题内容智能选择
**缺点**：多一次 LLM 调用，增加延迟和成本

### 方式二：规则匹配（我们项目用的）

```typescript
function selectMcpTool(query: string): { name: string; args: Record<string, unknown> } {
  if (/技术栈|前端框架|vue|react/.test(query)) {
    return { name: 'get_tech_stack', args: {} };
  }
  if (/秒开率|性能|优化数据/.test(query)) {
    return { name: 'get_performance_metrics', args: {} };
  }
  if (/稳定性|线上问题|故障/.test(query)) {
    return { name: 'get_stability_achievements', args: {} };
  }
  if (/接送列表|new.list/.test(query)) {
    return { name: 'get_project_experience', args: {} };
  }
  // 兜底：开放性问题用语义搜索
  return { name: 'search_resume', args: { query } };
}
```

**优点**：零 LLM 调用，速度快，成本低
**缺点**：需要维护规则，新类型问题要加规则

**面试话术**：
> "我们用的是规则匹配而非 LLM 自选。原因是面试问题类型相对固定，正则规则足够覆盖 90% 的场景。规则匹配零 LLM 调用，延迟更低、成本更省。如果未来问题类型变多，可以升级为 LLM 路由。"

---

## 五、Function Calling 的完整调用链路

```
用户输入："你的技术栈是什么"
       │
       ▼
1. selectMcpTool("你的技术栈是什么")
       │   └─ 正则匹配 /技术栈/ ──► 选 get_tech_stack
       ▼
2. callMCPTool('get_tech_stack', {})
       │   └─ fetch POST /mcp/tools/call
       ▼
3. MCP Server 执行 handler
       │   └─ 读取 01-个人概述.md
       ▼
4. 返回结果："核心框架：React、Vue、Rax..."
       │
       ▼
5. 结果注入 System Prompt
       │   【MCP 工具检索结果】
       │   核心框架：React、Vue、Rax...
       ▼
6. LLM 基于结果生成回答："我的前端技术栈主要是 React、Vue 和 Rax..."
```

---

## 六、常见追问

### Q: Function Calling 和 MCP 有什么区别？

**回答**：
> "Function Calling 是模型原生的能力——OpenAI、通义千问都支持，让 LLM 输出工具调用 JSON。MCP 是 Anthropic 推出的协议层标准，定义了工具怎么暴露、怎么调用、怎么返回。
>
> 区别就像：Function Calling 是'手机能打电话'这个功能，MCP 是'所有手机用同一个充电接口'这个标准。我们的项目两者都用：用 Function Calling 的能力让 LLM 输出工具调用，但用 MCP 的协议格式来标准化工具的定义和通信。"

### Q: 如果 LLM 传错了参数怎么办？

**回答**：
> "我们在三个层面做了防御：
> 1. **Schema 校验** — 收到 LLM 的 arguments 后，用 JSON Schema 校验参数类型和必填项
> 2. **默认值兜底** — 非必填参数给默认值，避免 undefined
> 3. **异常捕获** — handler 里 try-catch，出错时返回友好的错误信息，让 LLM 知道哪里错了，有机会重试"

### Q: Tool 太多会不会影响 LLM 的选择准确率？

**回答**：
> "会。Tool 越多，LLM 的混淆概率越高。我们的策略：
> 1. **精简 Tool 数量** — 只保留高频场景的工具，目前 5 个
> 2. **description 差异化** — 每个工具的 description 明确写'什么时候用、什么时候不用'
> 3. **分层路由** — 先做一个简单的意图分类（规则匹配），缩小工具选择范围"

---

## 七、面试话术（完整版）

> **"Function Calling 是怎么实现的？"**
>
> 我们的 Function Calling 分两层：工具定义层和调用执行层。
>
> **工具定义层**：每个工具有一个 Schema，包含 name、description 和 parameters。description 是关键——LLM 靠 description 判断什么时候用这个工具。比如 get_tech_stack 的 description 写明了"当面试官问技术栈时调用"，search_resume 写明了"开放性问题调用"。
>
> **调用执行层**：用户提问后，我们用规则匹配（正则）选择最合适的工具，而不是让 LLM 自己选。因为面试问题类型固定，规则匹配零 LLM 调用，更快更省。选中工具后，发 HTTP POST 到 MCP Server，Server 执行对应的 handler（比如读取知识库文件），返回结果。
>
> **结果处理**：工具返回的结果会注入 System Prompt，作为 LLM 生成回答的素材。LLM 基于这些真实数据组织语言，而不是凭空编造。
>
> 整个链路是：用户提问 → 规则匹配选工具 → HTTP 调用 MCP Server → 执行 handler → 结果注入 Prompt → LLM 生成回答。
