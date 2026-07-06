# 规格：用户身份识别

## 方案

采用浏览器端生成稳定 `user_id` 并存储在 `localStorage` 中。

## 详细规则

### 生成时机

- 页面首次加载时，如果 `localStorage` 中不存在 `interview_user_id`，则生成一个 UUID。
- 已存在时直接使用，不重新生成。

### ID 格式

- 使用 `crypto.randomUUID()` 生成标准 UUID v4。
- 示例：`550e8400-e29b-41d4-a716-446655440000`

### 传递方式

- 前端每次调用需要识别用户的接口时，在请求体或 query 中携带 `user_id`。
- 不涉及 HTTP Header、Cookie 或 JWT。

### 前端实现示例

```ts
// client/src/utils/user.ts
const USER_ID_KEY = 'interview_user_id';

export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}
```

## 限制与后续扩展

| 场景 | 行为 | 后续扩展 |
|------|------|----------|
| 同一浏览器刷新 | 身份不变 | 无需扩展 |
| 清 localStorage | 生成新身份，历史无法恢复 | 提供「自定义标识」绑定 |
| 换浏览器/设备 | 生成新身份 | 提供「自定义标识」绑定 |
| 隐身模式 | 每次打开生成新身份 | 提供「自定义标识」绑定 |

## 自定义标识（MVP 后）

允许用户在页面输入一个自定义标识（如邮箱前缀、昵称），后端将 `localStorage 的 user_id` 与 `自定义标识` 做映射。换设备时输入同一标识即可恢复历史。
