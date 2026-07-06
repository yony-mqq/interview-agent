# 任务清单：面试官访问控制

## 后端任务

- [ ] 1. 更新 `server/src/db/schema.ts`，新增 `access_verification_codes` 和 `interviewer_access` 表。
- [ ] 2. 创建 `server/src/types/access.ts`，定义认证相关类型。
- [ ] 3. 创建 `server/src/services/emailService.ts`，封装 SMTP 发送与 Mock 模式。
- [ ] 4. 创建 `server/src/services/accessControlService.ts`，实现验证码与会话管理。
- [ ] 5. 创建 `server/src/routes/access.ts`，实现 `/api/access/*` 接口。
- [ ] 6. 创建 `server/src/middleware/auth.ts`，实现认证中间件。
- [ ] 7. 在 `server/src/index.ts` 挂载 access 路由，并为聊天/会话/语音接口添加认证中间件。
- [ ] 8. 更新 `server/.env.example`，增加邮件与域名白名单配置。

## 前端任务

- [ ] 9. 创建 `client/src/utils/auth.ts`，实现 token 读写与请求头注入。
- [ ] 10. 创建 `client/src/hooks/useAuth.ts`，管理认证状态。
- [ ] 11. 创建 `client/src/components/AuthGate.tsx`，实现邮箱验证码认证弹窗。
- [ ] 12. 改造 `client/src/App.tsx`（或 Chat 入口），在打开 ChatPanel 前接入 AuthGate。
- [ ] 13. 更新 `client/src/hooks/useChat.ts`、`useConversations.ts`、`useMessages.ts`、`useSpeech.ts`，统一注入 `Authorization` 请求头。
- [ ] 14. 更新 `client/.env.example`（如有），说明认证相关配置。

## 验证任务

- [ ] 15. 后端 `npm run build` 通过。
- [ ] 16. 前端 `npm run build` 通过。
- [ ] 17. 浏览器验证：未认证时点击聊天入口弹出 AuthGate。
- [ ] 18. 浏览器验证：非白名单邮箱无法申请验证码。
- [ ] 19. 浏览器验证：Mock 模式下验证码校验通过后可进入对话。
- [ ] 20. 浏览器验证：清除 token 后再次访问需要重新认证。
