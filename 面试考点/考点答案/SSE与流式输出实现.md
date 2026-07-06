# SSE 与流式输出实现详解

> **面试高频题**："你的 Agent 是怎么实现流式输出的？SSE 和 WebSocket 有什么区别？"

---

## 一、SSE（Server-Sent Events）是什么

SSE 是一种**基于 HTTP 的单向推送协议**。浏览器通过一次 HTTP 请求建立连接后，服务器可以**多次、持续地**向客户端推送数据，直到主动关闭。

### 为什么选 SSE 而不是 WebSocket？

| 对比项 | SSE | WebSocket |
|---|---|---|
| 协议 | 基于 HTTP，兼容性好 | 独立的 ws 协议 |
| 方向 | 服务器 → 客户端单向 | 全双工 |
| 重连 | 浏览器原生自动重连 | 需手动实现 |
| 场景 | 流式输出、实时推送 | 双向通信（如聊天室） |
| 复杂度 | 低，就是 HTTP | 高，需握手、心跳 |

**LLM 流式输出是"服务器单向推给客户端"**，SSE 完全够用，而且更简单。

### SSE 的数据格式

SSE 的消息是纯文本，每条消息以 `\n\n` 结尾：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"content":"你好"}

data: {"content":"，我是"}

data: {"content":"面试助手"}

data: [DONE]
```

- `data:` 前缀是必须的
- 两条消息之间用**空行（`\n\n`）**分隔
- 服务器用 `[DONE]` 之类的自定义标记告诉客户端"结束了"

---

## 二、后端层：Express 怎么发 SSE

项目中有三个关键步骤：

### 1. 设置 SSE 响应头

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');  // 禁用 Nginx 缓冲
res.flushHeaders();  // 立即发送头，不要等 body
```

- `text/event-stream`：告诉浏览器这是 SSE 流
- `X-Accel-Buffering: no`：**关键**，如果部署在 Nginx 后面，Nginx 默认会缓冲响应，导致前端收不到实时数据
- `flushHeaders()`：立即把响应头发出去，不要让 Express 等到函数 return 才发

### 2. LLM 流式调用

```typescript
export async function* streamChat(messages: Message[]): AsyncGenerator<string> {
  const stream = await client.chat.completions.create({
    model: 'qwen-plus',
    messages,
    stream: true,  // 关键：开启流式
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;  // 每收到一个字，yield 出去
    }
  }
}
```

`stream: true` 让通义千问**边生成边返回**，不是等全部生成完再一次性返回。SDK 返回的是一个异步迭代器，每次 `yield` 出来的是一小段文本（可能是一个字、一个词、或一小句）。

### 3. 逐段写给前端

```typescript
for await (const content of streamChat(messages)) {
  if (isClientDisconnected) break;
  assistantContent += content;
  res.write(`data: ${JSON.stringify({ content })}\n\n`);  // 实时推给前端
}

// 结束标记
res.write('data: [DONE]\n\n');
```

`res.write()` 是 Node.js 原生方法，**不会等整个响应组装完**，而是立即把这一段数据写入 TCP 连接。这就是"流式"的核心 — 后端收到 LLM 的一个字，就立刻转发给前端。

---

## 三、前端层：怎么接收 SSE

前端没有直接用 `EventSource`（因为需要 POST 请求 + 自定义 Header），而是用 **Fetch API + ReadableStream** 手动解析，这是 SSE 的另一种接法，更灵活。

### 1. 发起请求

```typescript
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({ message: text, user_id: userId, ... }),
  signal: abortController.signal,  // 支持取消
});
```

注意这里用的是 `POST`，而原生 `EventSource` 只支持 `GET`，所以用 Fetch API 更灵活。

### 2. 读取流

```typescript
const reader = response.body?.getReader();  // 获取流读取器
const decoder = new TextDecoder();          // 把 Uint8Array 解码成字符串
let buffer = '';

while (true) {
  const { done, value } = await reader.read();  // 读取一块数据
  if (done) break;

  buffer += decoder.decode(value, { stream: true });  // 追加到缓冲区
  const parts = buffer.split('\n\n');                  // 按 SSE 分隔符切分
  buffer = parts.pop() || '';                          // 最后一段可能不完整，留到下次

  for (const part of parts) {
    const lines = part.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);  // 去掉 "data: " 前缀

      if (data === '[DONE]') break;  // 结束标记

      const parsed = JSON.parse(data);
      if (parsed.content) {
        // 更新 React state，实现逐字显示
        setMessages(prev => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: last.content + parsed.content }];
        });
      }
    }
  }
}
```

### 为什么需要 `buffer`？

因为网络传输是**分块**的，后端发的是：

```
data: {"content":"你"}\n\ndata: {"content":"好"}\n\n
```

但 TCP 可能把这两段粘在一起传过来，也可能把一段拆成两半。前端收到的 `value` 可能是：

- `"data: {\"content\":\"你\"}\n\ndata: {\"content\":\"好\"}\n\n"`（粘包）
- `"data: {\"content\":\"你\"}\n\nd"`（拆包，只收到一半）

所以用 `buffer` 累积数据，每次用 `\n\n` 切分，**不完整的最后一段留在 buffer 里等下次**。

---

## 四、完整数据流图示

```
用户输入 ──► 前端 fetch POST ──► 后端 Express
                                      │
                                      ▼
                              retrieveRelevantChunks() 检索知识库
                                      │
                                      ▼
                              streamChat() 调用 LLM (stream: true)
                                      │
                                      ▼
                              for await (chunk of stream)
                              res.write(`data: ${chunk}\n\n`)  ◄── 每个字实时写
                                      │
                    ┌─────────────────┘
                    ▼
              TCP 传输（可能粘包/拆包）
                    │
                    ▼
              前端 reader.read() ──► decoder.decode() ──► buffer.split('\n\n')
                    │
                    ▼
              JSON.parse(data.content) ──► setMessages() ──► 逐字渲染到 UI
```

---

## 五、面试话术

如果被问到"流式输出怎么实现的"，按这个顺序说：

1. **协议选择**：SSE 基于 HTTP，单向推送，比 WebSocket 轻量，适合 LLM 流式场景
2. **后端实现**：Express 设置 `text/event-stream` 响应头，LLM SDK 开 `stream: true`，用 `res.write()` 逐段转发
3. **前端实现**：Fetch API 获取 `ReadableStream`，用 `getReader()` + `TextDecoder` 读取，用 `buffer` 处理粘包拆包
4. **关键细节**：`X-Accel-Buffering: no` 防 Nginx 缓冲、`flushHeaders()` 立即发头、`[DONE]` 标记结束
