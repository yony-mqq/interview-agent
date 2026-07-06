# 技术设计方案：对话记忆管理

## 架构概览

```
┌─────────────┐         ┌─────────────────────────┐         ┌──────────────┐
│  React 前端  │ ──────▶ │    Express 后端          │ ──────▶ │   SQLite     │
│             │         │  ┌───────────────────┐  │         │   数据库文件  │
│ localStorage│         │  │  chat routes      │  │         │              │
│  user_id    │ ◀────── │  │  conversation     │  │ ◀────── │              │
│             │         │  │  message service  │  │         │              │
└─────────────┘         │  └───────────────────┘  │         └──────────────┘
                        │          │              │
                        │    ┌─────┴─────┐        │
                        │    │  db layer │        │
                        │    │ better-sqlite3     │
                        │    └───────────┘        │
                        └─────────────────────────┘
```

## 模块划分

### 后端

```
server/src/
├── db/
│   ├── index.ts          # SQLite 连接与初始化
│   ├── schema.ts         # 建表 SQL
│   └── migrations/       # 后续数据库迁移脚本
├── services/
│   ├── conversationService.ts
│   ├── messageService.ts
│   └── chatService.ts    # 改造现有 chat 服务
├── routes/
│   ├── chat.ts
│   └── conversations.ts
└── utils/
    └── user.ts           # user_id 校验工具
```

### 前端

```
client/src/
├── utils/
│   └── user.ts           # getUserId()
├── hooks/
│   ├── useConversations.ts
│   ├── useMessages.ts
│   └── useChat.ts        # 改造现有 hook
├── components/
│   ├── Chat.tsx          # 主聊天组件
│   ├── ConversationList.tsx
│   └── NewChatButton.tsx
└── types/
    └── conversation.ts
```

## 数据库层设计

### 初始化时机

应用启动时执行一次 `db/index.ts` 中的初始化逻辑：

```ts
import Database from 'better-sqlite3';
import { schemaSQL } from './schema.js';

const dbPath = process.env.DB_PATH || './data/interview.db';
export const db = new Database(dbPath);

db.exec(schemaSQL);
```

### 核心操作

```ts
// services/conversationService.ts
export function createConversation(userId: string, title?: string) { }
export function listConversations(userId: string, limit: number) { }
export function deleteConversation(id: string) { }
export function touchConversation(id: string) { }

// services/messageService.ts
export function addMessage(conversationId: string, role: string, content: string) { }
export function getMessages(conversationId: string, limit: number) { }
```

## `/api/chat` 改造流程

```
接收请求 { message, user_id, conversation_id? }
    │
    ▼
参数校验
    │
    ▼
无 conversation_id ?
    ├── 是：createConversation(user_id, message.slice(0,20))
    └── 否：校验会话归属 user_id
    │
    ▼
addMessage(conversationId, 'user', message)
    │
    ▼
history = getMessages(conversationId)
    │
    ▼
调用大模型，SSE 流式返回
    │
    ▼
流结束：addMessage(conversationId, 'assistant', fullContent)
    │
    ▼
touchConversation(conversationId)
```

## 前端会话恢复流程

```
页面加载
    │
    ▼
userId = getUserId()
    │
    ▼
GET /api/conversations?user_id=userId
    │
    ▼
存在会话 ?
    ├── 是：取最近一条 → GET /api/conversations/:id/messages → 渲染
    └── 否：显示欢迎语，等待用户发送第一条消息
```

## 关键状态管理

- `conversationId`：当前会话 ID，undefined 时表示未创建会话。
- `messages`：当前会话消息列表。
- `isStreaming`：是否正在接收 AI 回复，用于禁用输入框。

## 边界处理

1. **SSE 中断**：客户端检测到连接断开时，提示用户重试，不自动写入不完整回复。
2. **消息过长**：读取历史时限制 50 条，超出部分在 UI 折叠或分页。
3. **并发发送**：发送期间禁用输入，避免同一会话出现消息乱序。
4. **数据库锁定**：SQLite 写操作串行，无需额外锁。

## 部署配置

- 数据库文件路径通过环境变量 `DB_PATH` 配置。
- 生产环境建议 `/data/interview-agent/interview.db`。
- 每日定时备份数据库文件到 `/data/interview-agent/backup/`。
- PM2 单实例运行，环境变量在 `deploy/ecosystem.config.json` 中声明。

## 向后兼容

- 旧请求只传 `message` 和 `history` 时，后端创建新会话并保存，忽略 `history` 中的旧数据（或合并保存）。
- 推荐前端升级后始终携带 `user_id`。
