/**
 * 访问控制接口
 *
 * 使用场景：面试官首次打开页面时的身份校验与登录。
 * 作用：
 * 1. 支持邮箱验证码登录（白名单域名校验 + 邮件发送验证码）。
 * 2. 支持公司名称快捷登录（无需邮箱验证）。
 * 3. 校验当前会话 token 是否有效。
 * 4. 返回访问控制开关状态，供前端决定是否展示登录弹窗。
 * 当 ACCESS_CONTROL_ENABLED=false 时，这些接口仍可用，但业务路由不再强制校验 token。
 */
import { Router, Request, Response } from 'express';
import { sendVerificationCode } from '../services/emailService.js';
import {
  isDomainAllowed,
  isRateLimited,
  createVerificationCode,
  verifyCode,
  createAccess,
  createAccessByCompanyName,
  findByToken,
  touchAccess,
  isAccessControlEnabled,
} from '../services/accessControlService.js';
import { extractBearerToken } from '../middleware/auth.js';

const router = Router();

function validateEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * POST /api/access/request-code
 * 申请邮箱验证码。
 * 使用场景：用户在登录弹窗中输入邮箱后点击"获取验证码"时调用。
 * 后端会校验邮箱域名是否在白名单内，并限制发送频率（同一邮箱 1 小时内最多 5 次）。
 */
router.post('/access/request-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!validateEmail(email)) {
      res.status(400).json({ error: '邮箱格式无效' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isDomainAllowed(normalizedEmail)) {
      res.status(400).json({ error: '该邮箱域名不在白名单内' });
      return;
    }

    if (isRateLimited(normalizedEmail)) {
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      return;
    }

    const code = createVerificationCode(normalizedEmail);
    await sendVerificationCode({ to: normalizedEmail, code });

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Access/RequestCode] Error:', error);
    res.status(500).json({
      error: '发送验证码失败',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/access/verify-code
 * 校验验证码并创建访问会话。
 * 使用场景：用户收到邮箱验证码后，在登录弹窗中输入并提交时调用。
 * 验证通过后返回 session token，前端存入 localStorage 用于后续所有业务请求的认证。
 */
router.post('/access/verify-code', (req: Request, res: Response): void => {
  try {
    const { email, code } = req.body;

    if (!validateEmail(email) || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: '邮箱或验证码格式无效' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isDomainAllowed(normalizedEmail)) {
      res.status(400).json({ error: '该邮箱域名不在白名单内' });
      return;
    }

    const isValid = verifyCode(normalizedEmail, code.trim());

    if (!isValid) {
      res.status(401).json({ error: '验证码错误或已过期' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const { token, expiresAt } = createAccess(normalizedEmail, ip, ua);

    res.json({ success: true, token, expires_at: expiresAt });
  } catch (error) {
    console.error('[Access/VerifyCode] Error:', error);
    res.status(500).json({
      error: '验证失败',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/access/company-login
 * 使用公司名称创建访问会话，无需邮箱验证码。
 * 使用场景：用户选择"公司名称登录"方式时调用，简化登录流程。
 * 直接根据输入的公司名称生成 token，适用于不强制邮箱验证的场景。
 */
router.post('/access/company-login', (req: Request, res: Response): void => {
  try {
    const { company_name: companyName } = req.body;

    if (typeof companyName !== 'string' || !companyName.trim()) {
      res.status(400).json({ error: '请输入有效的公司名称' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const { token, expiresAt } = createAccessByCompanyName(companyName, ip, ua);

    res.json({ success: true, token, expires_at: expiresAt, company_name: companyName.trim() });
  } catch (error) {
    console.error('[Access/CompanyLogin] Error:', error);
    res.status(500).json({
      error: '登录失败',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/access/check
 * 校验当前会话是否有效。
 * 使用场景：页面加载时或 token 即将过期时调用，确认用户是否仍可继续访问。
 * 校验通过后会自动续期会话有效期（7 天）。
 */
router.get('/access/check', (req: Request, res: Response): void => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: '缺少认证令牌' });
      return;
    }

    const access = findByToken(token);

    if (!access || access.expires_at <= Math.floor(Date.now() / 1000)) {
      res.status(401).json({ error: '认证令牌无效或已过期' });
      return;
    }

    touchAccess(access.id);

    res.json({
      valid: true,
      email: access.email,
      company_domain: access.company_domain,
      company_name: access.company_name,
    });
  } catch (error) {
    console.error('[Access/Check] Error:', error);
    res.status(500).json({ error: '校验失败' });
  }
});

/**
 * GET /api/access/status
 * 返回访问控制是否开启。
 * 使用场景：页面首次加载时调用，前端根据此状态决定是否展示登录弹窗。
 * 当 enabled 为 false 时，用户可直接使用所有功能，无需登录。
 */
router.get('/access/status', (_req: Request, res: Response): void => {
  res.json({ enabled: isAccessControlEnabled() });
});

export default router;
