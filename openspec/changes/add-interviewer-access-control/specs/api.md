# 接口规格：面试官访问控制

## POST /api/access/request-code

申请邮箱验证码。

### 请求体

```json
{
  "email": " interviewer@alibaba-inc.com"
}
```

### 成功响应 200

```json
{
  "success": true,
  "message": "验证码已发送"
}
```

### 错误响应

- `400`：邮箱格式无效或域名不在白名单。
- `429`：请求过于频繁。
- `500`：邮件发送失败。

## POST /api/access/verify-code

校验验证码并创建访问会话。

### 请求体

```json
{
  "email": "interviewer@alibaba-inc.com",
  "code": "123456"
}
```

### 成功响应 200

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": 1718755200
}
```

### 错误响应

- `400`：参数缺失。
- `401`：验证码错误或已过期。
- `429`：尝试次数过多。

## GET /api/access/check

校验当前会话是否有效。

### 认证方式

请求头：`Authorization: Bearer <session_token>`

### 成功响应 200

```json
{
  "valid": true,
  "email": "interviewer@alibaba-inc.com",
  "company_domain": "alibaba-inc.com"
}
```

### 错误响应

- `401`：缺少 token 或 token 无效/过期。

## 受保护接口认证要求

以下接口需携带有效 session token：

- `POST /api/chat`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `DELETE /api/conversations/:id`
- `POST /api/speech/asr`
- `POST /api/speech/tts`

未携带或 token 无效时返回 `401 Unauthorized`。
