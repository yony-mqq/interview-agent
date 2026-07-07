# RAG（检索增强生成）流程详解

> **面试高频题**："你的 RAG 是怎么做的？Embedding 怎么生成的？检索用的什么相似度算法？"

---

## 一、RAG 是什么

RAG = Retrieval-Augmented Generation（检索增强生成）。

**核心思想**：大模型本身不知道你的个人信息，把个人知识库通过向量检索的方式"外挂"到大模型上，让回答基于真实文档而不是胡说八道。

**为什么面试要用 RAG：**
- 面试官问"说说你做过的项目"，Agent 不能胡编
- 需要基于你的真实简历、真实经历来回答
- RAG 让回答有"引用来源"，防止幻觉

---

## 二、完整 RAG 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                         知识库准备阶段                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  knowledge/*.md  ──►  build-index.ts  ──►  vectors.json         │
│  (原始文档)          (切分+Embedding)      (向量索引文件)          │
│                                                                 │
│  步骤：                                                           │
│  1. 按 ## 标题切分 Markdown                                       │
│  2. 短段落合并（500-800 字/ chunk）                               │
│  3. 调用 text-embedding-v3 生成向量                               │
│  4. 写入 vectors.json（增量更新）                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         在线检索阶段                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户提问 "项目经验"                                               │
│       │                                                         │
│       ▼                                                         │
│  embedder.ts: getEmbedding("项目经验")                            │
│       │  ──► 调用 text-embedding-v3                               │
│       ▼                                                         │
│  retriever.ts: cosineSimilarity()                                │
│       │  ──► 与 vectors.json 中所有 chunk 计算余弦相似度            │
│       ▼                                                         │
│  排序取 Top3，过滤 score < 0.65 的                                │
│       │                                                         │
│       ▼                                                         │
│  返回命中 chunks: [{title, content, embedding}]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Prompt 组装阶段                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  systemMessage.content = SYSTEM_PROMPT + 检索到的上下文            │
│                                                                 │
│  示例：                                                           │
│  你是马倩倩的面试回答助手...                                       │
│                                                                 │
│  以下是相关项目文档供参考：                                         │
│  [1] 接送列表架构                                                  │
│      new-list 接送机商品列表页采用 SSR + CSR 架构...               │
│  [2] 性能优化                                                      │
│      秒开率从 13% 提升到 80%...                                    │
│  [3] 稳定性建设                                                    │
│      累计排查线上问题 30+...                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LLM 生成阶段                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  messages = [system, ...history, user_question]                  │
│       │                                                         │
│       ▼                                                         │
│  streamChat(messages) ──► qwen-plus                              │
│       │                                                         │
│       ▼                                                         │
│  SSE 流式输出最终回答                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、每一步的详细实现

### Step 1: 知识库切分（build-index.ts）

**核心逻辑：按 `##` 标题切分 Markdown，短段落合并。**

```typescript
// 按 ## 标题切分
for (const line of lines) {
  if (line.startsWith("## ")) {
    sections.push({ title: currentTitle, lines: [...currentLines] });
    currentTitle = line.replace(/^##\s+/, "").trim();
    currentLines = [];
  } else {
    currentLines.push(line);
  }
}

// 合并短段落（目标 500-800 字/chunk）
if (buffer.content.length + sectionContent.length < CHUNK_MIN) {
  // 合并到前一个 chunk
} else {
  merged.push({ ...buffer });
}
```

**为什么按标题切分？**
- Markdown 的 `##` 天然是语义边界
- 同一标题下的内容是同一主题，切开后语义完整

**为什么要合并短段落？**
- 太短的 chunk（比如只有 100 字）Embedding 信息量太少
- 太长的 chunk（超过 800 字）检索精度下降
- 500-800 字是权衡精度和召回的甜蜜点

---

### Step 2: Embedding 生成（embedder.ts）

**核心逻辑：调用 DashScope text-embedding-v3。**

```typescript
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-v3',
    input: text,
  });
  return response.data[0].embedding;
}
```

**什么是 Embedding？**
- 把一段文本转换成高维向量（如 1024 维）
- 语义相近的文本，向量在空间中的距离也近
- "项目经验" 和 "做过什么项目" 的向量会很接近

**为什么用 text-embedding-v3？**
- DashScope 免费提供，中文效果优于 OpenAI 的 text-embedding-ada-002
- 与通义千问同生态，兼容性更好

---

### Step 3: 增量索引更新（build-index.ts）

**核心逻辑：用 MD5 判断文件是否变更，只更新变更的文件。**

```typescript
// 计算文件 MD5
const hash = md5(content);

// 对比 meta 中的 hash
if (meta.files[file] !== hash) {
  filesToProcess.push(file);
}

// 只重新生成变更文件的 chunks，不变的保留
const unchangedChunks = existingVectors.chunks.filter(
  (chunk) => !filesToProcess.includes(chunk.source)
);
```

**为什么要增量更新？**
- 知识库有十几个文件， Embedding API 每批最多 10 条
- 全量重新生成每次都要几十秒，增量只需几秒
- 省钱：Embedding API 虽然免费，但养成好习惯

---

### Step 4: 相似度检索（retriever.ts）

**核心逻辑：余弦相似度 + 阈值过滤。**

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 检索流程
const queryEmbedding = await getEmbedding(query);
const scored = store.chunks.map((chunk) => ({
  chunk,
  score: cosineSimilarity(queryEmbedding, chunk.embedding),
}));
scored.sort((a, b) => b.score - a.score);

// TopK + 阈值过滤
const topChunks = scored
  .slice(0, topK)
  .filter((item) => item.score >= SIMILARITY_THRESHOLD)  // 0.65
  .map((item) => item.chunk);
```

**为什么是余弦相似度？**
- Embedding 向量的方向比长度更重要
- 余弦相似度只关心方向差异，不受向量长度影响
- 值域 [-1, 1]，1 表示完全相同，0 表示无关

**为什么设 0.65 的阈值？**
- 低于 0.65 的检索结果通常语义相关性很差
- 如果全部低于阈值，宁愿让 LLM 基于通用知识回答，也不要塞垃圾上下文

**为什么只取 Top3？**
- System Prompt 空间有限，塞太多检索结果会挤占对话历史
- 3 条足够覆盖大多数面试问题的回答素材

---

### Step 5: Prompt 注入（prompt.ts + chat.ts）

**核心逻辑：把检索到的 chunks 拼接成上下文块，注入 System Prompt。**

```typescript
const contextText = chunks
  .map((chunk, i) => `[${i + 1}] ${chunk.title}\n${chunk.content}`)
  .join('\n\n');

const systemContent = `${SYSTEM_PROMPT}\n\n以下是相关项目文档供参考：\n${contextText}`;
```

**为什么用 `[1]` `[2]` `[3]` 编号？**
- 方便 LLM 在回答中引用来源（"如文档 [1] 所述..."）
- 也方便调试时追踪检索结果是否正确

---

## 四、关键参数速查

| 参数 | 值 | 含义 |
|---|---|---|
| `CHUNK_MIN` | 500 | 短段落合并阈值（字） |
| `CHUNK_MAX` | 800 | 单 chunk 最大长度（字） |
| `BATCH_SIZE` | 10 | Embedding API 每批上限 |
| `topK` | 3 | 检索返回条数 |
| `SIMILARITY_THRESHOLD` | 0.65 | 相似度过滤阈值 |
| Embedding 模型 | text-embedding-v3 | DashScope 中文 Embedding |

---

## 五、面试话术

> **"你的 RAG 是怎么做的？"**
>
> 我们的 RAG 分三步：离线索引、在线检索、Prompt 注入。
>
> 离线阶段，我把个人经历写成了 Markdown 知识库，用 build-index.ts 按 `##` 标题切分，短段落合并成 500-800 字的 chunk，然后调用 DashScope 的 text-embedding-v3 生成向量，存到 vectors.json。这里做了增量更新——用 MD5 判断文件是否变更，只重新生成变更文件的 embedding，省钱省时间。
>
> 在线阶段，用户提问后，我先把问题转成 embedding，然后和所有 chunk 做余弦相似度计算，排序取 Top3，过滤掉 score 低于 0.65 的。检索结果以 `[1] 标题\n内容` 的格式注入 System Prompt，让 LLM 基于真实文档回答。
>
> 整个 RAG 和我的 Memory 机制是配合的：RAG 负责检索静态知识库，Memory 负责管理动态对话历史，两者一起组装成完整的上下文给 LLM。

> **"Embedding 怎么生成的？用的什么模型？"**
>
> 调用 DashScope 的 text-embedding-v3，通过 OpenAI 兼容接口发送。文本按 batch=10 分批请求，响应里按 index 排序后取 embedding 数组。这个模型对中文语义理解很好，而且是免费的。

> **"检索用的什么相似度算法？为什么选这个？"**
>
> 余弦相似度。因为 Embedding 向量的方向代表语义，长度只是文本长短的副作用。余弦相似度只看方向差异，不受向量长度影响，值域在 [-1, 1] 之间，便于设定阈值过滤。我们还加了 0.65 的阈值，低于这个分数的结果直接丢弃，避免把无关内容塞进 Prompt。

---

## 六、常见追问

### Q: RAG 和 Fine-tuning 有什么区别？

| | RAG | Fine-tuning |
|---|---|---|
| 原理 | 外挂知识库，检索后注入 Prompt | 修改模型权重 |
| 更新成本 | 低，改文档重新索引即可 | 高，需要重新训练 |
| 实时性 | 实时，随时改文档 | 需要重新训练部署 |
| 成本 | 检索 API 几乎免费 | 训练费用高 |
| 适合场景 | 个人知识库、FAQ、文档问答 | 风格模仿、领域专用模型 |

**面试回答**："我们的场景是个人面试助手，知识库需要随时更新（比如加了新项目），RAG 的增量更新成本远低于 Fine-tuning。而且 RAG 能直接看到检索到的原文，可解释性更好。"

### Q: 检索效果不好怎么办？

**优化方向：**
1. **切分策略优化** — 按语义切分而非按长度切分（如用 `###` 进一步细分）
2. **混合检索** — 向量检索 + 关键词 BM25 混合打分
3. **重排序（Rerank）** — 用交叉编码器对 Top10 重新排序，取 Top3
4. **Query 改写** — 用户问"说说你做的项目"，自动扩展为"项目经验 负责 开发 技术栈"

### Q: 如果检索不到相关内容怎么办？

**现在的处理**（chat.ts）：
```typescript
// 检索失败或没命中，contextText 为空
// System Prompt 里就没有"以下是相关项目文档"这部分
// LLM 基于通用知识回答，但 System Prompt 里有约束："若上下文中没有相关信息，坦诚告知"
```

**面试回答**："我们做了优雅降级。如果检索没命中，System Prompt 里不会塞无关内容，LLM 会基于通用知识回答，同时 System Prompt 里要求'若上下文中没有相关信息，坦诚告知'，避免幻觉。"

---

## 七、LLM 在 RAG 中扮演什么角色

> **面试高频题**："LLM 在 RAG 里到底做了什么？它'知道'答案吗？"

### LLM 收到了什么（输入结构）

LLM 实际收到的 `messages` 数组长这样：

```json
[
  {
    "role": "system",
    "content": "你是马倩倩的面试回答助手...\n\n【历史对话摘要】\n面试官询问了项目经验...\n\n以下是相关项目文档供参考：\n[1] 接送列表架构\n    SSR + CSR 架构...\n[2] 性能优化\n    秒开率从 13% 提升到 80%..."
  },
  { "role": "user", "content": "介绍一下你做过的项目" },
  { "role": "assistant", "content": "我在飞猪负责接送列表项目..." },
  { "role": "user", "content": "那个项目的架构是怎么设计的" }
]
```

**拆解 LLM 的输入：**

| 输入部分 | 来源 | 作用 |
|---|---|---|
| **System Prompt** | `prompt.ts` | 人设约束 + 回答风格 + 防御性指令 |
| **对话摘要** | `memoryManager.ts` | 让 LLM 知道之前聊过什么 |
| **知识库 Chunks** | `retriever.ts` | 告诉 LLM "你的素材库就是这些" |
| **近期对话历史** | `memoryManager.ts` | 让 LLM 理解上下文和追问关系 |
| **当前用户问题** | 请求体 | LLM 要回答的目标 |

### LLM 拿到这些后做了什么

**先纠正一个常见误解：LLM 不是"知道答案然后说出来"，而是"基于你给的素材，按你的要求组织语言"。**

#### Step 1: 读取 System Prompt，锁定行为边界

System Prompt 里这几条对 LLM 的行为有决定性影响：

```
"基于提供的项目文档上下文，以第一人称回答"
"若上下文中没有相关信息，坦诚告知"
"不要编造不存在的信息"
```

**LLM 的理解**："我只能从 `[1][2][3]` 这些文档里找素材，不能瞎编。如果文档里没有，我要说不知道。"

这就是 **RAG 防幻觉的核心机制** — 不是 LLM 自己变诚实了，而是 Prompt 把它的"素材范围"锁死了。

#### Step 2: 匹配用户问题与知识库 Chunks

用户问"那个项目的架构是怎么设计的"，LLM 会：

1. **理解追问关系** — 看 history 里上一条是"介绍一下你做过的项目"，所以"那个项目"指"接送列表项目"
2. **扫描 chunks** — 在 `[1] 接送列表架构` `[2] 性能优化` `[3] 稳定性建设` 中匹配关键词
3. **筛选最相关的** — "架构"和 `[1]` 的标题匹配度最高，`[2]` 和 `[3]` 相关性较低

#### Step 3: 按 System Prompt 的格式约束组织回答

System Prompt 要求：
- 简洁，1-2 句话一个要点
- 用 `**加粗**` 标关键词
- 要点列表，不要大段文字
- 突出个人贡献 + 数据

LLM 从 `[1] 接送列表架构` 里提取到：
```
SSR + CSR 架构、数据流、状态管理、核心 Hook
```

然后按约束**重组语言**（不是复制粘贴）：
```
- **SSR + CSR 混合架构**：首屏用 SSR 直出，交互用 CSR 接管，秒开率从 13% → 80%
- **核心 Hook 设计**：封装了 useListData、useFilter 等 5 个业务 Hook，复用到 3 个列表页
```

#### Step 4: 逐 Token 生成输出

```typescript
const stream = await client.chat.completions.create({
  model: 'qwen-plus',
  messages: messages,  // ← 上面组装好的完整上下文
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  // "我" → "在" → "飞" → "猪" → "负" → "责"...
}
```

LLM 每次只生成 **1 个 token**（可能是一个字或半个字），基于：
- 已生成的内容（自回归，看前文决定下文）
- System Prompt 的约束（必须简洁、加粗、第一人称）
- 知识库 chunks 的信息（素材来源）

### 一句话总结

> **LLM 在 RAG 中不是"知识的拥有者"，而是"信息的组织者和翻译器"。**
>
> 它做的三件事：
> 1. **匹配** — 把用户问题和知识库 chunks 做语义匹配
> 2. **筛选** — 按相关性挑出最有用的信息
> 3. **重组** — 按 System Prompt 的格式约束，把素材重新组织成自然语言
>
> **知识在 RAG 里，智慧在 LLM 里。**
> - 知识库（vectors.json）= 你的真实经历素材
> - LLM = 把这些素材按面试话术标准"翻译"成流畅回答的引擎

### 面试话术

> **"LLM 在 RAG 里扮演什么角色？"**
>
> LLM 不是直接"知道答案"，而是基于我们喂给它的素材做信息重组。具体来说，我们把 System Prompt（人设约束）、对话摘要（长期记忆）、知识库检索结果（chunks）、近期对话历史（短期记忆）一起组装成 messages 数组发给 qwen-plus。
>
> LLM 收到后先做三件事：第一，读取 System Prompt 锁定行为边界（第一人称、简洁、不能编造）；第二，把用户问题和知识库 chunks 做语义匹配，找出最相关的素材；第三，按格式约束把素材重组成面试回答。最后通过 SSE 流式逐 token 生成。
>
> 所以 RAG 防幻觉不是靠 LLM 自己变聪明，而是靠 System Prompt 把它的素材范围锁死了 — 它只能从我们提供的 `[1][2][3]` 文档里找答案，文档里没有的就必须说不知道。
