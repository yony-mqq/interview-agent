# 规格：API 接口

## 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/conversations` | 获取当前用户的会话列表 |
| POST | `/api/conversations` | 创建新会话 |
| GET | `/api/conversations/:id/messages` | 获取指定会话的消息 |
| DELETE | `/api/conversations/:id` | 删除指定会话 |
| POST | `/api/chat` | 发送消息并流式返回（改造后支持持久化） |

---

## GET /api/conversations

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 是 | 用户 ID |
| `limit` | number | 否 | 返回数量上限，默认 20 |

### 响应

```json
{
  "conversations": [
    {
      "id": "conv-001",
      "title": "介绍一下稳定性建设",
      "created_at": "2026-06-15T10:00:00Z",
      "updated_at": "2026-06-15T10:05:00Z",
      "message_count": 6
    }
  ]
}
```

---

## POST /api/conversations

### 请求体

```json
{
  "user_id": "user-xxx"
}
```

### 响应

```json
{
  "id": "conv-new",
  "title": "新对话",
  "created_at": "2026-06-15T10:00:00Z",
  "updated_at": "2026-06-15T10:00:00Z"
}
```

---

## GET /api/conversations/:id/messages

### 响应

```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "你好",
      "created_at": "2026-06-15T10:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "你好！我是马倩倩...",
      "created_at": "2026-06-15T10:00:05Z"
    }
  ]
}
```

---

## DELETE /api/conversations/:id

### 响应

```json
{
  "success": true
}
```

---

## POST /api/chat（改造）

### 请求体

```json
{
  "message": "介绍一下你做过的稳定性建设",
  "user_id": "user-xxx",
  "conversation_id": "conv-001"
}
```

- `conversation_id` 可选。不传时自动创建新会话。
- 为保持向后兼容，旧请求中若同时没有 `user_id` 和 `conversation_id`，也创建新会话，但不做持久化（或提示前端升级）。

### 处理流程

1. 校验 `message` 和 `user_id`。
2. 若无 `conversation_id`，创建新会话，title 取 `message` 前 20 字。
3. 将用户消息写入 `messages` 表。
4. 读取该会话历史消息，构造 `history` 数组。
5. 调用大模型，SSE 流式返回。
6. 流结束后，将 assistant 完整回复写入 `messages` 表。
7. 更新 `conversations.updated_at`。

### 响应

SSE 流，格式与现有接口保持一致：

```
data: {"content": "在"}
data: {"content": "飞猪"}
data: {"content": "..."}
data: [DONE]
```

## 错误处理

| 状态码 | 场景 |
|--------|------|
| 400 | 缺少必填参数 |
| 404 | 会话不存在 |
| 500 | 数据库或模型调用失败 |
