# 实现任务清单：对话记忆管理

## Phase 1：后端基础

### 1.1 安装依赖

- [ ] 在 `server/` 下安装 `better-sqlite3` 和 `@types/better-sqlite3`。
- [ ] 验证 TypeScript 能正确编译 `better-sqlite3` 类型。

### 1.2 数据库模块

- [ ] 创建 `server/src/db/schema.ts`，包含 `conversations` 和 `messages` 建表 SQL。
- [ ] 创建 `server/src/db/index.ts`，完成 SQLite 连接、建表、索引初始化。
- [ ] 支持通过环境变量 `DB_PATH` 配置数据库文件路径。

### 1.3 Service 层

- [ ] 创建 `server/src/services/conversationService.ts`：
  - `createConversation(userId, title?)`
  - `listConversations(userId, limit?)`
  - `getConversationById(id)`
  - `deleteConversation(id)`
  - `touchConversation(id)`
- [ ] 创建 `server/src/services/messageService.ts`：
  - `addMessage(conversationId, role, content)`
  - `getMessages(conversationId, limit?)`

### 1.4 API 路由

- [ ] 创建 `server/src/routes/conversations.ts`，实现：
  - `GET /api/conversations`
  - `POST /api/conversations`
  - `GET /api/conversations/:id/messages`
  - `DELETE /api/conversations/:id`
- [ ] 在 `server/src/index.ts` 注册新路由。

### 1.5 改造 /api/chat

- [ ] 修改 `POST /api/chat` 请求体，支持 `user_id` 和 `conversation_id`。
- [ ] 实现自动创建会话、保存用户消息、读取历史、流式返回、保存 AI 消息。
- [ ] 更新 `server/src/services/chatService.ts`（或对应文件）。

### 1.6 后端验证

- [ ] 用 curl/Postman 测试四个 conversation 接口。
- [ ] 测试刷新后重新调用 `/api/chat` 能否延续历史。

---

## Phase 2：前端改造

### 2.1 用户 ID 工具

- [ ] 创建 `client/src/utils/user.ts`，实现 `getUserId()`。
- [ ] 在 `localStorage` 中读写 `interview_user_id`。

### 2.2 数据类型

- [ ] 创建 `client/src/types/conversation.ts`，定义 `Conversation` 和 `Message` 类型。

### 2.3 Hooks

- [ ] 创建 `client/src/hooks/useConversations.ts`。
- [ ] 创建 `client/src/hooks/useMessages.ts`。
- [ ] 改造 `client/src/hooks/useChat.ts`，支持传入 `conversationId`。

### 2.4 UI 组件

- [ ] 创建 `client/src/components/ConversationList.tsx`，展示会话列表。
- [ ] 创建 `client/src/components/NewChatButton.tsx`。
- [ ] 改造 `client/src/components/Chat.tsx`：
  - 加载时自动恢复最近会话。
  - 发送消息时调用改造后的 `/api/chat`。
  - 支持切换会话、新建会话、删除会话。

### 2.5 前端验证

- [ ] 刷新浏览器后历史消息自动恢复。
- [ ] 新建对话后发送消息，数据库生成新会话。
- [ ] 删除会话后列表刷新，关联消息被清空。

---

## Phase 3：部署与运维

### 3.1 部署配置

- [ ] 在 `deploy/ecosystem.config.json` 中声明 `DB_PATH` 环境变量。
- [ ] 在 `deploy/deploy.sh` 中创建 `/data/interview-agent/` 目录并设置权限。

### 3.2 备份策略

- [ ] 添加 crontab 定时任务，每日备份 SQLite 文件。
- [ ] 可选：保留最近 7 天备份，自动清理旧备份。

### 3.3 生产验证

- [ ] 部署到轻量服务器。
- [ ] 确认数据库文件生成在 `/data/interview-agent/` 下。
- [ ] 模拟对话、重启服务、确认数据不丢失。

---

## Phase 4：文档与归档

### 4.1 更新 README

- [ ] 在 `README.md` 中补充对话记忆功能说明。
- [ ] 补充环境变量 `DB_PATH` 说明。

### 4.2 更新 .env.example

- [ ] 在 `server/.env.example` 中添加 `DB_PATH` 示例。

### 4.3 归档 OpenSpec

- [ ] 实现完成后，将 `openspec/changes/add-conversation-memory/` 归档到 `openspec/changes/archive/`。
- [ ] 更新 `openspec/specs/project.md` 中的「当前变更」说明。
