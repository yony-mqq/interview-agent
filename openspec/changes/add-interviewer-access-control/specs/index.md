# 规格索引：面试官访问控制

## 功能规格

1. [数据模型](./data-model.md)：访问记录表、公司名称字段。
2. [接口规格](./api.md)：公司名登录、会话校验。
3. [认证流程](#认证流程)：前后端交互时序。

## 认证流程

```
用户点击聊天入口
    │
    ▼
前端检查 localStorage 中是否有有效 session_token
    │
    ├── 有：调用 GET /api/access/check 校验
    │       ├── 有效：直接打开 ChatPanel
    │       └── 失效/异常：弹出 AuthGate
    │
    └── 无：弹出 AuthGate
                │
                ▼
        输入公司名称 → 点击「进入」
                │
                ▼
        POST /api/access/company-login { company_name }
                │
                ▼
        后端写入 interviewer_access 审计表 → 返回 session_token
                │
                ▼
        前端保存 session_token → 打开 ChatPanel
```

## 安全规则

- 公司名称前端非空校验，后端再次校验非空。
- session_token 有效期 7 天，每次访问续期。
- 未携带有效 token 时，所有聊天相关接口返回 `401 Unauthorized`。
