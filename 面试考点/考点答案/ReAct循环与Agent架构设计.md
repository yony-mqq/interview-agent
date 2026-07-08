# ReAct 循环与 Agent 底层架构设计

> **面试高频题**："你的 Agent 底层架构是怎么设计的？Thought → Action → Observation 是怎么流转的？"

---

## 一、ReAct 是什么

ReAct = Reasoning（推理）+ Acting（行动）。

**核心思想**：大模型不是一次性给出答案，而是像人一样**先思考、再行动、再观察结果、再思考**，循环直到问题解决。

```
传统 LLM 调用：
  用户提问 ──► LLM 一次性生成回答 ──► 结束
  
ReAct 循环：
  用户提问 ──► Thought（思考）──► Action（行动）──► Observation（观察）──► Thought（再思考）──► ... ──► Final Answer
```

**为什么面试要用 ReAct：**
- 展示你理解 Agent 的核心机制，不只是调 API
- 能讲清楚"Agent 和简单 ChatBot 的区别"
- 面试官想听你有没有"闭环思维"

---

## 二、ReAct 三步循环详解

### Step 1: Thought（思考）

LLM 收到用户问题后，不直接回答，而是先**分析自己需要做什么**。

**示例**：
```
用户问："马倩倩在飞猪做过什么项目？"

LLM 的 Thought：
"用户问的是马倩倩的项目经验。我需要先检索知识库，
 找到她做过哪些项目，然后再组织语言回答。"
```

**关键点**：Thought 是 LLM 的"内心独白"，决定下一步 Action。

---

### Step 2: Action（行动）

根据 Thought 的结论，执行一个具体的工具调用。

**示例**：
```
Thought 决定了"需要检索知识库" → Action 是调用 search_resume 工具

Action: search_resume({"query": "飞猪 项目 马倩倩"})
```

**常见的 Action 类型**：

| Action | 作用 | 示例 |
|---|---|---|
| `search` | 检索知识库 | `search_resume("项目经验")` |
| `calculate` | 计算 | `calculate("1000 / 50")` |
| `fetch` | 获取外部数据 | `fetch("https://api.example.com/data")` |
| `final_answer` | 给出最终回答 | 结束循环 |

---

### Step 3: Observation（观察）

Action 执行完后，把结果返回给 LLM，LLM "观察"这个结果。

**示例**：
```
Observation: 
"检索结果：
 [1] 接送列表架构 — 马倩倩在飞猪负责 new-list 接送机商品列表页...
 [2] 稳定性建设 — 累计排查线上问题 30+..."
```

LLM 看到这个 Observation 后，进入下一轮 Thought：
```
Thought: 
"检索到了两个项目：接送列表和稳定性建设。
 用户问'做过什么项目'，我需要把这两个项目都列出来，
 并突出个人贡献和数据。"
```

然后决定新的 Action 或者直接 final_answer。

---

## 三、完整循环示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
用户："马倩倩在飞猪做过什么项目？"

Thought: "用户问项目经验，我需要先检索知识库。"
Action: search_resume({"query": "飞猪 项目"})
Observation: "[1] 接送列表架构... [2] 稳定性建设..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Thought: "检索到了两个项目，可以组织回答了。"
Action: final_answer("马倩倩在飞猪主要负责两个项目：...")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
结束
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**什么时候停止循环？**
- Action 是 `final_answer` → 停止
- 达到最大循环次数（如 5 次）→ 停止，返回当前最佳结果
- 出现循环依赖（Thought 反复说同样的话）→ 停止，提示用户

---

## 四、项目中的简化实现

我们项目没有引入 LangChain 的 ReAct 代理，而是**手写了一个轻量级循环**，面试时能讲清楚原理。

### 核心代码（`server/src/chat/chat.ts` 简化版）

```typescript
// 模拟 ReAct 循环的简化版本
export async function handleChat(req: Request, res: Response) {
  const { message, user_id } = req.body;

  // === Round 1: Thought ===
  // "用户问了什么？我需要检索知识库吗？"
  
  // === Round 1: Action ===
  // 检索 RAG 知识库
  const chunks = await retrieveRelevantChunks(message, 3);
  
  // === Round 1: Observation ===
  // chunks = [{title: "接送列表架构", content: "...", score: 0.89}, ...]

  // === Round 2: Thought ===
  // "检索到了相关文档，现在组装 Prompt 让 LLM 生成回答"

  // === Round 2: Action ===
  // 调用 MCP 工具补充结构化数据
  const mcpResult = await runMCPForQuery(message);
  
  // === Round 2: Observation ===
  // mcpResult = "技术栈：React、Vue、Rax..."

  // === Round 3: Thought + Final Answer ===
  // 组装完整上下文，调用 LLM 流式生成最终回答
  const messages = buildMessages({
    systemPrompt: SYSTEM_PROMPT,
    history: await getMemory(user_id),
    ragChunks: chunks,
    mcpResult: mcpResult,
    userQuestion: message,
  });

  // 流式输出
  for await (const content of streamChat(messages)) {
    res.write(`data: ${JSON.stringify({ content })\\}\\n\\n`);
  }
  res.write('data: [DONE]\\n\\n');
}
```

**为什么是"简化版"而不是标准 ReAct？**

标准 ReAct 的 Action 是由 LLM 自己决定的（LLM 输出 JSON 决定调用哪个工具）。我们的实现是**规则驱动**的：
- 先走 RAG 检索（固定第一步）
- 再走 MCP 工具调用（固定第二步）
- 最后 LLM 生成回答（固定第三步）

**面试话术**：
> "我们项目用的是简化版 ReAct。标准 ReAct 需要 LLM 每一步都输出 Thought + Action JSON，我们为了降低延迟和成本，把流程固化了：先 RAG 检索，再 MCP 查结构化数据，最后 LLM 生成。这样三步就走完，不需要让 LLM 反复决策。如果面试官追问'为什么不标准'，可以说这是针对面试场景的优化——面试问题类型相对固定，规则驱动比模型驱动更稳定。"

---

## 五、Agent 和简单 ChatBot 的区别

| | 简单 ChatBot | Agent |
|---|---|---|
| 核心逻辑 | 一问一答，直接生成 | Thought → Action → Observation 循环 |
| 工具调用 | 无 | 有，可以调用外部工具 |
| 记忆管理 | 简单历史拼接 | 摘要 + 向量检索 |
| 异常处理 | 无 | 有重试、降级、兜底 |
| 适用场景 | 闲聊、FAQ | 复杂任务、多步推理 |

**面试一句话**：
> "ChatBot 是'有问必答'，Agent 是'先想后做'。Agent 的核心是 ReAct 循环——它会在回答前思考自己需要什么信息，然后主动调用工具去获取，再根据结果调整策略。"

---

## 六、常见追问

### Q: 你的 Agent 是单 Agent 还是多 Agent？

**回答**：目前是单 Agent。但如果面试官追问，可以说：
> "目前是单 Agent 架构，因为面试场景相对单一。如果要扩展，可以拆成多 Agent：一个 Router Agent 负责意图识别（技术题 vs 行为题 vs 开放题），然后分发给不同的 Specialist Agent。Router + Specialist 的模式在复杂场景下更清晰，每个 Agent 有独立的 Prompt 和评测标准。"

### Q: ReAct 和 CoT（思维链）有什么区别？

| | CoT | ReAct |
|---|---|---|
| 核心 | 只在思考，不行动 | 思考 + 行动 |
| 输出 | 一段推理文本 | Thought + Action + Observation 循环 |
| 工具 | 不调用工具 | 可以调用外部工具 |
| 关系 | ReAct 包含 CoT | CoT 是 ReAct 的 Thought 部分 |

**回答**："CoT 是让 LLM 把推理过程写出来，比如'因为 A 所以 B'。ReAct 在 CoT 的基础上加了 Action——不只是想，还要动手去做（调用工具）。所以 ReAct 是 CoT 的超集。"

### Q: 如果 LLM 的 Thought 错了怎么办？

**回答**：
> "这是 ReAct 的一个风险点。我们的解决方案：
> 1. **约束 Thought 范围** — System Prompt 里明确告诉 LLM 有哪些工具可用、每个工具做什么
> 2. **规则兜底** — 关键步骤（如 RAG 检索）不依赖 LLM 决策，固定执行
> 3. **最大循环限制** — 超过 5 轮还没出 final_answer，强制退出并返回当前最佳结果
> 4. **Observation 校验** — 工具返回的结果做格式校验，异常时返回错误信息给 LLM，让它重新 Thought"

---

## 七、面试话术（完整版）

> **"你的 Agent 底层架构是怎么设计的？"**
>
> 我们的 Agent 基于 ReAct 模式设计，核心是 Thought → Action → Observation 的循环。
>
> 具体来说，用户提问后，Agent 不会直接让 LLM 回答，而是先走三步：
> 1. **RAG 检索（Action）** — 把用户问题转成 Embedding，去向量库检索相关知识库 chunks
> 2. **MCP 工具调用（Action）** — 根据问题类型，调用对应的结构化查询工具（如 get_tech_stack、search_resume）
> 3. **LLM 生成（Final Answer）** — 把检索结果、工具返回、对话历史一起组装成 Prompt，流式生成回答
>
> 这个流程是规则驱动的，不是让 LLM 每一步都决策。原因是面试问题类型相对固定，规则驱动比模型驱动更稳定、更快、更便宜。
>
> 和传统 ChatBot 的区别在于：ChatBot 是一问一答，Agent 是先思考需要什么信息，再主动获取，再组织回答。这个"先想后做"的循环是 Agent 的核心能力。
