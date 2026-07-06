import crypto from 'crypto';
import { db } from '../db/index.js';
import type { AccessVerificationCode, InterviewerAccess } from '../types/access.js';

const CODE_TTL_SECONDS = 300; // 5 分钟
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天
const REQUEST_INTERVAL_SECONDS = 60; // 同一邮箱两次申请间隔
const MAX_REQUESTS_PER_HOUR = 5; // 同一邮箱 1 小时内最多申请次数
const MAX_ATTEMPTS_PER_CODE = 3; // 每个验证码最多尝试次数

function getEmailDomain(email: string): string {
  return email.toLowerCase().split('@')[1] || '';
}

export function getAllowedDomains(): string[] {
  const domainsEnv = process.env.ACCESS_EMAIL_DOMAINS || '';
  return domainsEnv
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isAccessControlEnabled(): boolean {
  const explicit = process.env.ACCESS_CONTROL_ENABLED;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return getAllowedDomains().length > 0;
}

export function isDomainAllowed(email: string): boolean {
  const domain = getEmailDomain(email);
  const allowed = getAllowedDomains();
  return allowed.length === 0 || allowed.includes(domain);
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 检查同一邮箱是否触发频率限制。
 */
export function isRateLimited(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  const oneHourAgo = nowSeconds() - 3600;

  const recentCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM access_verification_codes
       WHERE email = ? AND created_at > ?`
    )
    .get(lowerEmail, oneHourAgo) as { count: number };

  if (recentCount.count >= MAX_REQUESTS_PER_HOUR) {
    return true;
  }

  const lastCode = db
    .prepare(
      `SELECT created_at FROM access_verification_codes
       WHERE email = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(lowerEmail) as { created_at: number } | undefined;

  if (lastCode && nowSeconds() - lastCode.created_at < REQUEST_INTERVAL_SECONDS) {
    return true;
  }

  return false;
}

/**
 * 创建并保存新的验证码。
 */
export function createVerificationCode(email: string): string {
  const lowerEmail = email.toLowerCase();
  const code = generateCode();
  const now = nowSeconds();
  const id = crypto.randomUUID();

  // 清理该邮箱已过期或已用完的验证码
  db.prepare(
    `DELETE FROM access_verification_codes
     WHERE email = ? OR expires_at < ?`
  ).run(lowerEmail, now);

  db.prepare(
    `INSERT INTO access_verification_codes (id, email, code, expires_at, attempt_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, lowerEmail, code, now + CODE_TTL_SECONDS, 0, now);

  return code;
}

/**
 * 校验验证码。
 * 返回 true 表示验证通过；false 表示验证码错误或已过期。
 */
export function verifyCode(email: string, code: string): boolean {
  const lowerEmail = email.toLowerCase();
  const now = nowSeconds();

  const record = db
    .prepare(
      `SELECT * FROM access_verification_codes
       WHERE email = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(lowerEmail) as AccessVerificationCode | undefined;

  if (!record) return false;
  if (record.expires_at < now) return false;
  if (record.attempt_count >= MAX_ATTEMPTS_PER_CODE) return false;

  const isMatch = record.code === code;

  // 无论对错都增加尝试次数
  db.prepare(
    `UPDATE access_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?`
  ).run(record.id);

  return isMatch;
}

/**
 * 创建访问会话记录（邮箱验证方式）。
 */
export function createAccess(
  email: string,
  ip: string,
  ua: string
): { token: string; expiresAt: number } {
  const lowerEmail = email.toLowerCase();
  const domain = getEmailDomain(lowerEmail);
  const now = nowSeconds();
  const token = generateToken();
  const expiresAt = now + SESSION_TTL_SECONDS;
  const id = crypto.randomUUID();

  // 如果该邮箱已存在访问记录，更新它
  const existing = db
    .prepare(`SELECT id FROM interviewer_access WHERE email = ?`)
    .get(lowerEmail) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE interviewer_access
       SET session_token = ?, expires_at = ?, last_access_at = ?, ip = ?, ua = ?
       WHERE id = ?`
    ).run(token, expiresAt, now, ip, ua, existing.id);
  } else {
    db.prepare(
      `INSERT INTO interviewer_access (id, email, company_domain, session_token, expires_at, verified_at, last_access_at, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, lowerEmail, domain, token, expiresAt, now, now, ip, ua);
  }

  return { token, expiresAt };
}

function normalizeCompanyName(name: string): string {
  return name.trim();
}

/**
 * 创建访问会话记录（公司名称方式）。
 */
export function createAccessByCompanyName(
  companyName: string,
  ip: string,
  ua: string
): { token: string; expiresAt: number } {
  const normalizedName = normalizeCompanyName(companyName);
  const now = nowSeconds();
  const token = generateToken();
  const expiresAt = now + SESSION_TTL_SECONDS;
  const id = crypto.randomUUID();

  const existing = db
    .prepare(`SELECT id FROM interviewer_access WHERE company_name = ?`)
    .get(normalizedName) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE interviewer_access
       SET session_token = ?, expires_at = ?, last_access_at = ?, ip = ?, ua = ?
       WHERE id = ?`
    ).run(token, expiresAt, now, ip, ua, existing.id);
  } else {
    db.prepare(
      `INSERT INTO interviewer_access (id, company_name, session_token, expires_at, verified_at, last_access_at, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, normalizedName, token, expiresAt, now, now, ip, ua);
  }

  return { token, expiresAt };
}

/**
 * 根据 token 查找访问记录。
 */
export function findByToken(token: string): InterviewerAccess | undefined {
  return db
    .prepare(`SELECT * FROM interviewer_access WHERE session_token = ?`)
    .get(token) as InterviewerAccess | undefined;
}

/**
 * 更新访问记录的最近访问时间，并续期会话。
 */
export function touchAccess(id: string): void {
  const now = nowSeconds();
  const newExpiresAt = now + SESSION_TTL_SECONDS;

  db.prepare(
    `UPDATE interviewer_access
     SET last_access_at = ?, expires_at = ?
     WHERE id = ?`
  ).run(now, newExpiresAt, id);
}

/**
 * 清理过期的验证码和会话记录。
 */
export function cleanupExpiredRecords(): void {
  const now = nowSeconds();
  db.prepare(`DELETE FROM access_verification_codes WHERE expires_at < ?`).run(now);
  db.prepare(`DELETE FROM interviewer_access WHERE expires_at < ?`).run(now);
}
