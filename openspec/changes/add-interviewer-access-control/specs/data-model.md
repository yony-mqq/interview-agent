# 数据模型：面试官访问控制

## 表：access_verification_codes

存储邮箱验证码，用于一次性校验。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| email | TEXT NOT NULL | 面试官邮箱 |
| code | TEXT NOT NULL | 6 位数字验证码 |
| expires_at | INTEGER NOT NULL | 过期时间戳（秒） |
| attempt_count | INTEGER DEFAULT 0 | 已尝试次数 |
| created_at | INTEGER NOT NULL | 创建时间戳（秒） |

## 表：interviewer_access

存储已通过验证的面试官访问记录，用于审计和会话续期。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| email | TEXT NOT NULL UNIQUE | 面试官邮箱 |
| company_domain | TEXT NOT NULL | 企业邮箱域名，如 alibaba-inc.com |
| session_token | TEXT NOT NULL UNIQUE | 访问会话令牌 |
| expires_at | INTEGER NOT NULL | 会话过期时间戳（秒） |
| verified_at | INTEGER NOT NULL | 首次验证时间戳（秒） |
| last_access_at | INTEGER | 最近访问时间戳（秒） |
| ip | TEXT | 首次验证 IP |
| ua | TEXT | 首次验证 User-Agent |

## 配置：公司域名白名单

白名单通过环境变量 `ACCESS_EMAIL_DOMAINS` 配置，逗号分隔。

示例：

```env
ACCESS_EMAIL_DOMAINS=alibaba-inc.com,tencent.com,bytedance.com,meituan.com,baidu.com,jd.com,xiaomi.com,netease.com,huawei.com,antgroup.com
```

## 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS access_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_codes_email ON access_verification_codes(email);

CREATE TABLE IF NOT EXISTS interviewer_access (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  company_domain TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  last_access_at INTEGER,
  ip TEXT,
  ua TEXT
);

CREATE INDEX IF NOT EXISTS idx_interviewer_access_token ON interviewer_access(session_token);
CREATE INDEX IF NOT EXISTS idx_interviewer_access_email ON interviewer_access(email);
```
