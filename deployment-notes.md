# interview-agent 前端静态资源部署记录

## 一、目标架构

- **访问地址**：`https://www.mqqyony.xyz/app/resume`
- **资源存放**：阿里云 OSS `mqq-resume` bucket（华北2 北京）
- **静态资源路径**：`app/resume/` 目录
- **加速与 HTTPS**：阿里云 CDN + SSL 证书
- **API 服务**：待后续部署到 `https://api.mqqyony.xyz/api`

> 域名 `mqqyony.xyz` 已完成 ICP 备案，子域名 `www.mqqyony.xyz` 可直接使用，无需单独备案。

---

## 二、前端构建配置

### 1. 修改 Vite base 路径

文件：`client/vite.config.ts`

```ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/app/resume/' : '/',
  // ...
}))
```

作用：生产构建后，JS/CSS 等资源引用路径会带 `/app/resume/` 前缀。

### 2. 配置生产环境 API 地址

文件：`client/.env.production`

```env
VITE_API_BASE_URL=https://api.mqqyony.xyz/api
```

### 3. 集中管理 API_BASE_URL

文件：`client/src/config.ts`

```ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
```

### 4. 替换硬编码 API 路径

将 `useAuth.ts`、`useMessages.ts`、`useConversations.ts`、`AuthGate.tsx`、`ChatPanel.tsx` 等文件中的 `/api/...` 改为 `${API_BASE_URL}/...`。

### 5. 构建

```bash
cd interview-agent/client
npm run build
```

产物在 `client/dist/` 目录。

---

## 三、上传静态资源到 OSS

### 1. 创建 Bucket

- Bucket 名称：`mqq-resume`
- 地域：华北2（北京）
- 权限：公共读

### 2. 关闭「阻止公共访问」

路径：OSS 控制台 → `mqq-resume` → 权限管理 → 阻止公共访问 → **关闭**

### 3. 上传构建产物

将 `client/dist/` 下的所有文件上传到 OSS 的 `app/resume/` 目录下。

最终 OSS 中的关键文件路径：

```text
app/resume/index.html
app/resume/assets/xxx.js
app/resume/assets/xxx.css
```

---

## 四、OSS 静态页面设置

路径：OSS 控制台 → `mqq-resume` → 基础设置 → 静态页面

| 配置项 | 值 |
|-------|-----|
| 默认首页 | `index.html` |
| 子目录首页 | **开启** |

> 开启子目录首页后，`/app/resume/`（带斜杠）可直接访问到 `app/resume/index.html`。

---

## 五、CDN 加速配置

### 1. 添加 CDN 加速域名

- 加速域名：`www.mqqyony.xyz`
- 源站类型：OSS 域名
- 源站地址：`mqq-resume.oss-cn-beijing.aliyuncs.com`

### 2. 完成域名归属权验证

按 CDN 控制台提示，在 DNS 解析中添加 `verification` 主机记录的 TXT 验证值。

### 3. 配置 HTTPS

- 在 CDN 控制台 → HTTPS 配置中申请/上传 SSL 证书
- 选择个人测试证书或免费证书即可
- 开启 HTTPS 加速

---

## 六、DNS 解析配置

### 1. 添加 CNAME 记录

路径：阿里云 DNS 控制台 → `mqqyony.xyz` → 解析设置

| 主机记录 | 记录类型 | 记录值 |
|---------|---------|--------|
| `www` | CNAME | CDN 分配的 CNAME 地址 |

> 注意：记录值必须是 CDN 分配的 CNAME（如 `*.w.kunlunar.com`），不能是 OSS 源站地址。

### 2. 等待生效

CNAME 生效通常需要 5-10 分钟。可用以下命令验证：

```bash
nslookup www.mqqyony.xyz
```

---

## 七、CDN 回源路径重写

### 1. 添加重写规则

路径：CDN 控制台 → 域名管理 → `www.mqqyony.xyz` → 回源配置 → 重写回源路径 → 添加

| 字段 | 值 |
|-----|-----|
| 待重写的Path | `^/app/resume$` |
| 目标Path | `/app/resume/index.html` |
| 执行规则 | `break` |

作用：当用户访问 `/app/resume` 时，CDN 回源到 OSS 的实际路径会变为 `/app/resume/index.html`，浏览器 URL 保持不变。

### 2. 等待生效

保存后等待 5-10 分钟。

---

## 八、验证访问

访问以下地址测试：

```text
https://www.mqqyony.xyz/app/resume
https://www.mqqyony.xyz/app/resume/
```

正常应返回简历页面，且 JS/CSS 资源从 `/app/resume/assets/` 加载。

---

## 九、后续：API 服务部署

下一步计划：将 `interview-agent/server` 部署到可处理 `https://api.mqqyony.xyz/api/*` 请求的服务器。

待选方案：

- 阿里云 ECS + Nginx 反向代理
- 阿里云函数计算 FC
- 宝塔面板 + PM2

具体方案待确认后继续补充。
