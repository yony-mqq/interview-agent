# LangChain / LangGraph 框架与编排

> **面试高频题**："你用过 LangChain 吗？LangGraph 是什么？Agent 的 Workflow 怎么编排？"
> **考点2 强调**："LangChain/LangGraph 是第一梯队必问/必考。"

---

## 一、LangChain 是什么

LangChain = 大模型应用开发框架，把 LLM 开发中常见的模式封装成可复用的组件。

**核心模块**：

| 模块 | 作用 | 我们的项目对应 |
|---|---|---|
| `Model I/O` | 封装各种 LLM API 调用 | `streamChat()` 调用 qwen-plus |
| `Retrieval` | RAG 检索流程 | `retrieveRelevantChunks()` |
| `Chains` | 把多个步骤串成链 | `buildMessages() + streamChat()` |
| `Memory` | 对话历史管理 | `memoryManager.ts` |
| `Agents` | ReAct 循环实现 | 我们的简化版 ReAct |

**为什么用 LangChain：**
- 不用从零写 LLM 调用、Prompt 模板、输出解析
- 组件可替换（今天用 OpenAI，明天换通义千问，只需改一行）
- 生态丰富，社区方案多

**为什么我们的项目没用 LangChain：**
> "为了面试时能讲清楚原理，我们是手写的。LangChain 封装得太厚，面试官问底层实现时容易说不清楚。手写虽然代码多，但每个环节都能讲明白。"

---

## 二、LangGraph 是什么

LangGraph = LangChain 的扩展，用**图（Graph）**的方式编排 Agent 工作流。

**核心思想**：把 Agent 的每个步骤定义为图中的节点，步骤之间的关系定义为边，通过图的结构控制执行流程。

```
LangChain（链式）：
  Step1 → Step2 → Step3 → Step4
  线性执行，一条路走到底

LangGraph（图式）：
        ┌──► Step2a ──┐
  Step1 ──► Step2b ──┼──► Step4
        └──► Step2c ──┘
  条件分支，循环，并行都可以
```

### LangGraph 的核心概念

| 概念 | 作用 | 类比 |
|---|---|---|
| `State` | 整个工作流的共享状态 | Redux 的 Store |
| `Node` | 工作流中的一个步骤 | 函数 |
| `Edge` | 步骤之间的流转关系 | if/else |
| `Conditional Edge` | 条件分支 | switch/case |

---

## 三、LangGraph 工作流示例

### 面试场景的 Graph 设计

```
                    ┌─────────────────┐
                    │    START        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  意图识别节点     │
                    │  (Router)        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ 技术题    │  │ 行为题    │  │ 开放题    │
       │ 处理节点  │  │ 处理节点  │  │ 处理节点  │
       └────┬─────┘  └────┬─────┘  └────┬─────┘
            │             │             │
            └─────────────┼─────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  答案生成节点     │
                 │  (LLM)           │
                 └────────┬────────┘
                          │
                          ▼
                    ┌──────────┐
                    │   END    │
                    └──────────┘
```

### 伪代码实现

```typescript
import { StateGraph, END } from '@langchain/langgraph';

// 1. 定义 State（共享状态）
interface AgentState {
  question: string;
  intent: 'tech' | 'behavior' | 'open' | null;
  retrievedChunks: Chunk[];
  mcpResult: string | null;
  answer: string;
}

// 2. 定义节点（每个节点是一个函数）
async function intentRecognition(state: AgentState): Promise<AgentState> {
  // 用轻量级模型判断意图
  const intent = await classifyIntent(state.question);
  return { ...state, intent };
}

async function techNode(state: AgentState): Promise<AgentState> {
  // 技术题：走 RAG + MCP
  const chunks = await retrieveRelevantChunks(state.question, 3);
  const mcp = await runMCPForQuery(state.question);
  return { ...state, retrievedChunks: chunks, mcpResult: mcp };
}

async function behaviorNode(state: AgentState): Promise<AgentState> {
  // 行为题：只走 RAG，不走 MCP
  const chunks = await retrieveRelevantChunks(state.question, 3);
  return { ...state, retrievedChunks: chunks, mcpResult: null };
}

async function openNode(state: AgentState): Promise<AgentState> {
  // 开放题：语义搜索
  const chunks = await retrieveRelevantChunks(state.question, 5);
  return { ...state, retrievedChunks: chunks, mcpResult: null };
}

async function generateNode(state: AgentState): Promise<AgentState> {
  // 组装 Prompt，调用 LLM
  const messages = buildMessages(state);
  const answer = await streamChat(messages);
  return { ...state, answer };
}

// 3. 条件路由函数
function routeByIntent(state: AgentState): string {
  switch (state.intent) {
    case 'tech': return 'techNode';
    case 'behavior': return 'behaviorNode';
    case 'open': return 'openNode';
    default: return 'openNode';
  }
}

// 4. 构建图
const workflow = new StateGraph<AgentState>({
  channels: {
    question: { value: (x, y) => y ?? x },
    intent: { value: (x, y) => y ?? x },
    // ...
  },
});

workflow
  .addNode('intentRecognition', intentRecognition)
  .addNode('techNode', techNode)
  .addNode('behaviorNode', behaviorNode)
  .addNode('openNode', openNode)
  .addNode('generateNode', generateNode)
  .addEdge('__start__', 'intentRecognition')
  .addConditionalEdges('intentRecognition', routeByIntent)
  .addEdge('techNode', 'generateNode')
  .addEdge('behaviorNode', 'generateNode')
  .addEdge('openNode', 'generateNode')
  .addEdge('generateNode', END);

// 5. 编译执行
const app = workflow.compile();

const result = await app.invoke({
  question: '你的技术栈是什么',
});
console.log(result.answer);
```

---

## 四、LangGraph vs 我们的手写实现

| 对比项 | LangGraph | 我们的手写实现 |
|---|---|---|
| 代码量 | 少，框架封装 | 多，自己写流转逻辑 |
| 可维护性 | 高，图结构清晰 | 中，代码分散在各文件 |
| 面试讲解 | 难讲清底层 | 容易讲清每个环节 |
| 扩展性 | 高，加节点即可 | 中，需要改多处 |
| 学习成本 | 需要学框架 | 只需懂基础 TypeScript |

**面试话术**：
> "我们项目目前是手写实现，没有引入 LangGraph。原因是：
> 1. 面试场景相对简单，线性流程够用，不需要复杂的分支和循环
> 2. 手写实现能讲清楚每个环节的数据流转，面试官问到底层时不依赖框架黑盒
> 3. 代码量可控，不会因为引入框架而增加理解成本
>
> 但我了解 LangGraph 的核心概念——State、Node、Edge、Conditional Edge。如果项目复杂度上升（比如支持多轮追问、支持多 Agent 协作），我会考虑迁移到 LangGraph，用图的方式管理状态流转。"

---

## 五、多 Agent 协作（Orchestrator 模式）

如果面试官追问"多 Agent 怎么协作"，可以用这个架构：

```
┌─────────────────────────────────────────────────────────┐
│                   Orchestrator Agent                    │
│                   （总调度）                              │
└─────────────┬─────────────────────────────┬─────────────┘
              │                             │
              ▼                             ▼
┌─────────────────────┐         ┌─────────────────────┐
│   技术题 Agent       │         │   行为题 Agent       │
│   - 走 RAG          │         │   - 走经历库         │
│   - 走 MCP          │         │   - 结构化回答       │
│   - 代码相关        │         │   - STAR 格式        │
└─────────────────────┘         └─────────────────────┘
              │                             │
              └─────────────┬───────────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │   答案生成 Agent     │
                  │   - 统一格式化       │
                  │   - 风格一致性       │
                  └─────────────────────┘
```

**面试话术**：
> "多 Agent 协作我们用的是 Orchestrator 模式。一个主 Agent 负责意图识别和任务分发，每个子 Agent 有独立的 Prompt 和工具链。比如技术题 Agent 走 RAG + MCP，行为题 Agent 走经历库检索。每个子 Agent 独立可测试，Orchestrator 负责把结果汇总后交给生成 Agent 统一输出。"

---

## 六、常见追问

### Q: LangChain 的 Chain 和 LangGraph 的 Graph 有什么区别？

**回答**：
> "Chain 是线性的——Step1 → Step2 → Step3，一条路走到底。Graph 是图结构的——可以有分支（条件路由）、循环（反复迭代）、并行（同时执行多个节点）。
>
> 我们的项目目前是 Chain 模式，因为流程是固定的：RAG → MCP → LLM。如果未来要加'根据回答质量决定是否重新检索'这种循环逻辑，就需要 Graph 模式了。"

### Q: 状态管理（State）在 LangGraph 里怎么工作？

**回答**：
> "LangGraph 的 State 是所有节点共享的'全局变量'。每个节点读取 State，处理后返回新的 State，下一个节点基于更新后的 State 继续执行。
>
> 比如 State 里有 `retrievedChunks` 字段，RAG 节点写入检索结果，生成节点读取它组装 Prompt。这种设计避免了函数之间传参的混乱，状态流转很清晰。"

### Q: 如果不用 LangChain，你自己怎么实现类似的 Chain？

**回答**：
> "我们的实现就是手写 Chain：
> ```typescript
> const result = await chain(
>   input,
>   [ragStep, mcpStep, buildPromptStep, llmStep]
> );
> ```
> 每一步都是一个纯函数，接收上一步的输出，返回下一步的输入。用数组定义执行顺序，用 try-catch 做异常处理。虽然简单，但核心思想和 LangChain 的 Chain 是一样的——把复杂流程拆成可复用的步骤，按顺序组装。"

---

## 七、面试话术（完整版）

> **"你用过 LangChain 吗？LangGraph 是什么？"**
>
> 我了解 LangChain 的核心模块：Model I/O（封装 LLM 调用）、Retrieval（RAG 流程）、Chains（步骤串联）、Memory（对话管理）、Agents（ReAct 循环）。
>
> LangGraph 是 LangChain 的扩展，用图的方式编排工作流。核心概念是 State（共享状态）、Node（步骤）、Edge（流转关系）和 Conditional Edge（条件分支）。比如面试场景可以设计一个 Graph：意图识别节点 → 条件分支（技术题/行为题/开放题）→ 各自的检索节点 → 统一的生成节点。
>
> 我们的项目目前是手写实现，没有引入 LangChain。原因是面试场景相对简单，线性流程够用；而且手写能讲清楚每个环节的数据流转，面试官问底层时不依赖框架黑盒。但我了解 LangGraph 的设计理念，如果项目复杂度上升，会考虑迁移到图编排。
>
> 如果做多 Agent 协作，我会用 Orchestrator 模式：一个主 Agent 负责意图识别和任务分发，技术题 Agent 走 RAG + MCP，行为题 Agent 走经历库，每个子 Agent 独立可测试，最后统一生成答案。
