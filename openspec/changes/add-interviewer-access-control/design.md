# 技术设计方案：面试官访问控制

## 架构概览

```
┌─────────────┐         ┌─────────────────────────────┐         ┌──────────────┐
│  React 前端  │ ──────▶ │      Express 后端            │ ──────▶ │   SQLite     │
│             │         │  ┌───────────────────────┐  │         │              │
│  AuthGate   │         │  │ access routes         │  │         │ access_      │
│  useAuth    │ ◀────── │  │ accessControlService  │  │ ◀────── │ verification │
│  token      │         │  │ emailService          │  │         │ _codes       │
│  (localStorage)        │  │ authMiddleware        │  │         │ interviewer_ │
│             │         │  └───────────────────────┘  │         │ _access      │
└─────────────┘         └─────────────────────────────┘         └──────────────┘
                                │
                                ▼
                          SMTP / 阿里云 DirectMail
```

## 模块划分

### 后端

```
server/src/
├── db/
│   └── schema.ts              # 增加 access_verification_codes、interviewer_access 表
├── services/
│   ├── accessControlService.ts # 验证码生成、校验、会话管理
│   └── emailService.ts         # 邮件发送与 Mock 模式
├── routes/
│   └── access.ts               # /api/access/* 路由
├── middleware/
│   └── auth.ts                 # 保护聊天接口的认证中间件
└── types/
    └── access.ts               # 类型定义
```

### 前端

```
client/src/
├── components/
│   └── AuthGate.tsx            # 认证弹窗
├── hooks/
│   └── useAuth.ts              # 认证状态管理
├── utils/
│   └── auth.ts                 # token 读写、请求头注入
└── App.tsx                     # 在 Chat 入口前接入 AuthGate
```

## 认证中间件

```ts
function authMiddleware(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const access = accessControlService.findByToken(token);
  if (!access || access.expires_at <= Date.now() / 1000) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }

  accessControlService.touchAccess(access.id);
  req.interviewer = { email: access.email, company_domain: access.company_domain };
  next();
}
```

## 邮件服务

生产环境使用 SMTP 发送验证码邮件。开发环境开启 `ACCESS_MOCK=true` 时：

- 不发送真实邮件。
- 验证码直接打印到服务端日志。
- 前端仍然走完整流程，便于调试。

邮件内容模板：

```
主题：【面试助手】验证码 123456
正文：
您好，

您正在访问马倩倩的面试 AI 助手。验证码为：123456

5 分钟内有效，请勿泄露给他人。
```

## 关键状态管理

### 前端

- `authToken`：localStorage 中保存的 session token。
- `isAuthenticated`：是否已通过认证。
- `authStatus`：`'idle' | 'loading' | 'success' | 'error'`。

### 后端

- `access_verification_codes`：短期验证码记录。
- `interviewer_access`：长期会话记录与审计日志。

## 安全设计

1. **验证码生成**：6 位随机数字，有效期 300 秒。
2. **频率限制**：
   - 同一邮箱两次申请间隔 ≥ 60 秒。
   - 同一邮箱 5 分钟内最多申请 5 次，超过锁定 1 小时。
3. **尝试限制**：同一验证码最多 3 次错误尝试。
4. **会话安全**：
   - token 使用 `crypto.randomUUID` 或 `crypto.randomBytes` 生成。
   - 有效期 7 天，每次访问聊天接口续期 7 天。
5. **传输安全**：生产环境强制 HTTPS。

## 向后兼容

- 未开启访问控制时（未配置 `ACCESS_EMAIL_DOMAINS`），所有接口保持公开，不影响现有体验。
- 开启后，未认证用户无法调用任何聊天相关接口。
