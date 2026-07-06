# 面试 Agent 助手

基于 RAG (检索增强生成) 的面试回答助手，嵌入个人简历页面中，通过知识库检索 + 通义千问大模型，以第一人称回答面试官问题。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite (better-sqlite3)
- **AI**: 通义千问 qwen-plus (DashScope API)
- **向量化**: text-embedding-v3
- **语音**: 阿里云智能语音交互（ASR 一句话识别 + TTS 语音合成）
- **部署**: Nginx + PM2

## 项目结构

```
interview-agent/
├── client/          # React 前端（简历页面 + Chat 组件）
├── server/          # Node.js 后端（RAG API）
├── knowledge/       # RAG 知识库 Markdown 文档
├── openspec/        # OpenSpec 规格驱动开发文档
├── scripts/         # 知识库构建脚本
├── data/            # 向量索引数据 & 本地 SQLite
└── deploy/          # 部署配置
```

## 快速开始

### 1. 配置环境变量

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入：
# - DASHSCOPE_API_KEY（大模型）
# - ALIYUN_AK_ID / ALIYUN_AK_SECRET / ALIYUN_NLS_APPKEY（语音功能）
# - 本地调试无阿里云账号时，可设置 SPEECH_MOCK=true
# DB_PATH 可选，默认 ./data/interview.db（开发环境）
```

### 2. 构建知识库索引

```bash
cd scripts
npm install
npm run build-index
```

### 3. 启动开发环境

```bash
# 终端 1: 启动后端
cd server
npm install
npm run dev

# 终端 2: 启动前端
cd client
npm install
npm run dev
```

访问 http://localhost:5173 查看效果。

## 语音对话（第一阶段）

数字人模式支持语音输入与 TTS 语音输出：

- **ASR 语音输入**: 点击输入框旁麦克风按钮录音，松开后自动调用阿里云一句话识别，识别结果作为问题发送。
- **TTS 语音输出**: 数字人模式下，AI 回复完成后自动调用阿里云语音合成并播放。
- **Mock 模式**: 设置 `SPEECH_MOCK=true` 可在无阿里云账号时调试语音流程，ASR 返回固定文本，TTS 返回静音音频。

### 语音配置

1. 在 [阿里云智能语音交互控制台](https://nls-portal.console.aliyun.com/applist) 创建项目，获取 **Appkey**。
2. 在 [RAM 访问控制](https://ram.console.aliyun.com/manage/ak) 获取 **AccessKey ID** 和 **AccessKey Secret**。
3. 填入 `server/.env` 中的 `ALIYUN_AK_ID`、`ALIYUN_AK_SECRET`、`ALIYUN_NLS_APPKEY`。

## 对话记忆管理

本项目支持服务端持久化对话历史：

- 前端基于 `localStorage` 生成稳定的 `user_id`。
- 后端使用 **SQLite** 存储会话（conversations）和消息（messages）。
- 刷新页面后自动恢复最近一次对话。
- 支持创建多个独立会话、切换会话、删除会话。

### 数据库备份（生产环境）

```bash
# 添加定时任务，每天凌晨 3 点备份
crontab -e
0 3 * * * cp /data/interview-agent/interview.db /data/interview-agent/backup/interview_$(date +\%Y\%m\%d).db
```

### 4. 生产部署

在阿里云轻量服务器上:

```bash
# 确保已安装 Node.js, Nginx, PM2
npm install -g pm2

# 执行部署脚本
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

## 知识库管理

在 `knowledge/` 目录下添加/修改 Markdown 文件，然后重新构建索引:

```bash
cd scripts
npm run build-index
```

支持增量更新，仅处理有变更的文件。

## API 说明

### POST /api/chat

请求:
```json
{
  "message": "介绍一下你做过的稳定性建设",
  "user_id": "user-xxx",
  "conversation_id": "conv-xxx"   // 可选，不传则自动创建新会话
}
```

### 会话管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/conversations?user_id=xxx` | 获取会话列表 |
| POST | `/api/conversations` | 创建新会话 |
| GET | `/api/conversations/:id/messages` | 获取会话消息 |
| DELETE | `/api/conversations/:id` | 删除会话 |
| POST | `/api/speech/asr` | 语音转文字（base64 音频） |
| POST | `/api/speech/tts` | 文字转语音（返回 base64 音频） |

响应: SSE 流 (text/event-stream)
```
data: {"content": "在飞"}
data: {"content": "猪综合交通"}
data: {"content": "..."}
data: [DONE]
```
