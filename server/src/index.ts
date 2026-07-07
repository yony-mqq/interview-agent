import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import './db/index.js';
import chatRouter from './routes/chat.js';
import conversationsRouter from './routes/conversations.js';
import speechRouter from './routes/speech.js';
import accessRouter from './routes/access.js';
import mcpRouter from './mcp/server.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS - 允许所有来源（部署时收紧）
app.use(cors());

// JSON 解析（语音接口需要较大的 base64 音频载荷）
app.use(express.json({ limit: '10mb' }));

// 健康检查（无需认证）
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 访问控制相关接口（无需认证）
app.use('/api', accessRouter);

// MCP Server 接口（无需认证，内部协议）
app.use('/api', mcpRouter);

// 受保护的业务路由
app.use('/api', authMiddleware, chatRouter);
app.use('/api', authMiddleware, conversationsRouter);
app.use('/api', authMiddleware, speechRouter);

// 启动服务器
app.listen(PORT, () => {
  console.log(`[Server] Interview Agent backend running on http://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});

export default app;
