import nodemailer from 'nodemailer';

interface SendVerificationCodeOptions {
  to: string;
  code: string;
}

function isMockMode(): boolean {
  return process.env.ACCESS_MOCK === 'true';
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP 配置不完整：请配置 SMTP_HOST、SMTP_USER、SMTP_PASS');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * 发送验证码邮件。
 * 当 ACCESS_MOCK=true 时，不发送真实邮件，仅在服务端日志打印验证码。
 */
export async function sendVerificationCode({ to, code }: SendVerificationCodeOptions): Promise<void> {
  if (isMockMode()) {
    console.log(`[EmailService/Mock] 验证码已生成：${to} -> ${code}`);
    return;
  }

  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject: '【面试助手】验证码',
    text: `您好，\n\n您正在访问马倩倩的面试 AI 助手。验证码为：${code}\n\n5 分钟内有效，请勿泄露给他人。`,
    html: `<p>您好，</p><p>您正在访问马倩倩的面试 AI 助手。验证码为：<strong>${code}</strong></p><p>5 分钟内有效，请勿泄露给他人。</p>`,
  });
}
