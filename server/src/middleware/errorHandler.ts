/**
 * 全局错误处理中间件
 *
 * 职责：
 * 1. 统一捕获路由 handler 中抛出的同步/异步错误
 * 2. 区分「已知业务错误」（AppError）和「未知系统错误」
 * 3. SSE 连接已建立时，以 SSE error 事件优雅关闭，避免客户端挂死
 * 4. 统一日志格式，方便排查
 */
import { Request, Response, NextFunction } from 'express';

/**
 * 业务错误类 —— 带 HTTP 状态码和错误码
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 全局错误处理中间件（Express 约定：4 个参数）
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  // 已知业务错误：返回结构化 JSON
  if (err instanceof AppError) {
    console.error(`[ErrorHandler][${timestamp}] AppError ${err.statusCode} ${err.code}: ${err.message}`);
    if (!res.headersSent) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code || 'BUSINESS_ERROR',
      });
    } else {
      // SSE 已建立，发 error 事件后关闭
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message }) }\n\n`);
      res.end();
    }
    return;
  }

  // 未知系统错误
  console.error(`[ErrorHandler][${timestamp}] Unexpected:`, err);

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal server error' }) }\n\n`);
    res.end();
  }
}

/**
 * 异步路由包装器 —— 自动捕获 async 函数中的异常并交给 next(err)
 *
 * 用法：router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
