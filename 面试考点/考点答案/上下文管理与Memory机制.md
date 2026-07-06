# 上下文管理与 Memory 机制

> **面试高频题**："多轮对话的上下文怎么管理？Token 爆了怎么办？"

---

## 一、当前项目上下文管理现状

### 1. 数据存储：SQLite，只有原始消息

```sql
messages 表结构：
  id, conversation_id, role, content, created_at
```

**缺少的关键字段：**
- `token_count` — 不知道每条消息消耗多少 token
- `summary` — 没有对话摘要
- 没有专门的摘要表

### 2. 消息获取：简单粗暴的"取最近50条"

```typescript
export function getHistoryMessages(conversationId: string, limit = 50): Message[] {
  const messages = getMessages(conversationId, limit);  // 最近50条
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}
```

**存在的问题：**
- 按**条数**限制，不是按**token**限制。50条长回答可能几千 token，50条短问答可能才几百 token
- 超出 50 条的历史直接丢弃，**面试官追问之前的细节时，Agent 完全没记忆**
- 没有按重要性筛选，早年的废话和新问题同等权重

### 3. 请求组装：全部塞进 LLM

```typescript
const messages: Message[] = [
  systemMessage,           // system prompt（固定）
  ...messageHistory,       // 最近50条历史
  { role: 'user', content: message },  // 当前问题
];
```

**问题：**
- 没有 token 上限检查，对话长了直接爆上下文窗口
- 没有摘要机制，旧对话丢了就是真丢了

---

## 二、完善的 Memory 机制设计方案

**核心目标：在 Token 预算内，保留最有价值的信息。**

### 三层记忆架构

```
┌─────────────────────────────────────────────┐
│  Layer 1: System Prompt + 知识库上下文        │  ← 固定，每次必带
│  （你的简历、项目经验、人设约束）               │
├─────────────────────────────────────────────┤
│  Layer 2: 对话摘要 (Conversation Summary)     │  ← 长期记忆
│  （超出滑动窗口的旧对话，压缩成摘要）           │
├─────────────────────────────────────────────┤
│  Layer 3: 滑动窗口 (Sliding Window)           │  ← 短期记忆
│  （最近 N 轮对话，完整保留）                   │
├─────────────────────────────────────────────┤
│  Layer 4: 当前用户输入                         │  ← 本次请求
└─────────────────────────────────────────────┘
```

### 具体策略

| 策略 | 作用 | 实现方式 |
|---|---|---|
| **Token 估算** | 知道每条消息占多少 token | 简易估算：中文≈1 token/字，英文≈0.25 token/字 |
| **滑动窗口** | 保留最近完整对话 | 从后往前累加 token，超出预算就截断 |
| **对话摘要** | 旧对话不丢，压缩记忆 | 调用 LLM 对截断部分生成摘要，存数据库 |
| **摘要刷新** | 摘要本身也会过期 | 每轮对话后检查，超出窗口就重新生成 |

### Token 预算分配（示例）

假设用 qwen-plus，上下文窗口约 32K，设定安全上限：

```
总预算: 4000 tokens（给 LLM 留出生成空间）

分配：
  - System Prompt + 知识库: ~1000 tokens（固定）
  - 对话摘要: ~500 tokens（动态）
  - 滑动窗口（最近对话）: ~2000 tokens（动态）
  - 当前输入: ~500 tokens（动态）
```

---

## 三、关键实现原理

### 1. Token 估算

不引入 tiktoken 这种重依赖，用简易规则：

```typescript
function estimateTokens(text: string): number {
  // 中文/日文/韩文等 CJK 字符 ≈ 1 token
  const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 英文单词 ≈ 0.25 token/字
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount + nonCjkCount * 0.25);
}
```

> 面试话术："我们先用字符级估算做 MVP，后续可以接入 tiktoken 做精确统计。"

### 2. 滑动窗口算法

```typescript
function buildSlidingWindowMessages(
  history: Message[],      // 全部历史
  summary: string,         // 已有摘要
  maxTokens: number,       // 窗口预算
): { recentMessages: Message[]; overflowMessages: Message[] } {
  // 从最新消息往前累加，直到超出预算
  let totalTokens = estimateTokens(summary);  // 摘要先占预算

  const recent: Message[] = [];
  const overflow: Message[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (totalTokens + tokens <= maxTokens) {
      recent.unshift(history[i]);  // 从头部插入，保持顺序
      totalTokens += tokens;
    } else {
      overflow.unshift(history[i]);  // 超出预算的，归入溢出
    }
  }

  return { recentMessages: recent, overflowMessages: overflow };
}
```

### 3. 摘要生成策略

**什么时候生成摘要？**
- 对话轮数超过窗口阈值时
- 或者，溢出消息累积到一定 token 数时

**怎么生成？**
- 调用一个轻量级模型（如 qwen-turbo）生成摘要
- Prompt 模板："请总结以下对话的核心内容，保留关键信息..."

**摘要的 Prompt 注入方式：**

```typescript
const summaryContext = summary
  ? `【历史对话摘要】\n${summary}\n\n`
  : '';

const systemMessage: Message = {
  role: 'system',
  content: `${SYSTEM_PROMPT}\n\n${summaryContext}以下是相关项目文档供参考：\n${contextText}`,
};
```

---

## 四、数据库改造

新增 `conversation_summaries` 表：

```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,  -- 摘要覆盖了多少条消息
  token_count INTEGER DEFAULT 0,     -- 摘要本身的 token 数
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

---

## 五、完整的请求组装流程（改造后）

```
1. 获取当前会话的全部历史消息
   │
   ▼
2. 检查是否有对话摘要
   │   ├─ 有：获取摘要，记为 summary
   │   └─ 无：summary = ""
   │
   ▼
3. 用滑动窗口算法分配 Token 预算
   │   预算 = MAX_CONTEXT_TOKENS - systemPromptTokens - currentInputTokens
   │   recent = 窗口内的完整消息
   │   overflow = 被挤出去的消息
   │
   ▼
4. overflow 有内容？
   │   ├─ 是：调用 LLM 生成新摘要，更新数据库
   │   └─ 否：用现有摘要
   │
   ▼
5. 组装最终 messages
   │   [system: SYSTEM_PROMPT + 摘要 + 知识库上下文]
   │   [user/assistant... 滑动窗口内的历史]
   │   [user: 当前问题]
   │
   ▼
6. 调用 LLM 流式输出
```

---

## 六、面试话术

> **"多轮对话的上下文怎么管理？Token 爆了怎么办？"**
>
> 我们设计了一个三层记忆架构。第一层是固定 system prompt + RAG 检索的知识库上下文。第二层是对话摘要，超出滑动窗口的旧对话会被 LLM 压缩成摘要注入 system prompt，这样面试官追问之前的细节时，Agent 不会失忆。第三层是滑动窗口，保留最近 N 轮完整对话，token 超出预算就从旧消息开始截断。
>
> 具体来说，我们做了一个 Token 预算分配器：先扣除 system prompt 的固定消耗，剩下的预算按滑动窗口从最新消息往前填充，装不下的旧消息触发摘要生成。摘要存在单独的数据表里，每轮对话后检查是否需要刷新。我们还用字符级估算做了轻量级 token 统计，中文字符按 1 token、英文按 0.25 token，精度足够支撑这个场景。

---

## 七、补充：为什么要做 Memory 而不是直接全量塞

| 问题 | 后果 | Memory 解决 |
|---|---|---|
| 上下文窗口有限 | 旧消息被截断，Agent"失忆" | 摘要保留关键信息 |
| Token 成本 | 每轮都传全量历史，费用线性增长 | 滑动窗口控制预算 |
| 噪声累积 | 早期无关对话干扰当前回答 | 摘要过滤噪声 |
| 延迟增加 | 消息越多，LLM 处理越慢 | 控制输入 token 数 |
