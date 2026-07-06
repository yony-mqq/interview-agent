# 规格：数据库表结构

## 数据库选型

- **选型**：SQLite
- **原因**：零配置、单文件、轻量、适合个人项目和轻量服务器
- **连接库**：`better-sqlite3`

## 表结构

### conversations（会话表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | 会话 UUID |
| `user_id` | TEXT | NOT NULL | 关联用户 ID |
| `title` | TEXT |  | 会话标题，默认取首条用户消息前 20 字 |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 最后更新时间 |

### messages（消息表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 自增主键 |
| `conversation_id` | TEXT | NOT NULL, FOREIGN KEY | 关联会话 ID |
| `role` | TEXT | NOT NULL CHECK('user'\|'assistant'\|'system') | 消息角色 |
| `content` | TEXT | NOT NULL | 消息内容 |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

## 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
```

## 数据关系

```
users (前端生成 user_id，不单独建表)
  │
  ├── conversations (1:N)
  │     │
  │     └── messages (1:N)
```

## 约定

1. 不单独建 `users` 表，`user_id` 由前端生成并直接存储在 `conversations` 中。
2. 删除会话时，通过 `ON DELETE CASCADE` 级联删除消息。
3. 消息按 `created_at` 升序排列，组成对话历史。
4. 读取历史时限制条数（默认 50，可配置），避免上下文过长。
