# 项目级规格：interview-agent

## 项目定位

基于 RAG + 大模型的面试回答助手，嵌入个人简历页面，以第一人称回答面试官问题。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS
- **后端**：Node.js + Express + TypeScript
- **AI**：通义千问 qwen-plus（DashScope API）
- **向量化**：text-embedding-v3
- **部署**：Nginx + PM2，部署在阿里云轻量服务器

## 核心原则

1. **轻量**：适合个人项目，避免过度工程化。
2. **可维护**：代码与规格文档一一对应，便于后续 AI 接手。
3. **可观测**：关键路径有日志，生产环境有错误监控。
4. **安全**：API Key 等敏感信息走环境变量，不提交到仓库。

## 目录约定

- `knowledge/`：RAG 知识库 Markdown，仅用于向量检索，不存放设计文档。
- `openspec/`：OpenSpec 规格驱动开发目录，存放提案、规格、设计、任务。
- `client/`：前端源码。
- `server/`：后端源码。
- `scripts/`：知识库构建脚本。
- `data/`：向量索引数据（可重建，不提交到仓库）。
- `deploy/`：部署配置。

## 变更管理

所有功能增强、架构调整、重大 bug 修复都应先在 `openspec/changes/` 下创建变更目录，完成 proposal → specs → design → tasks 后再进入实现阶段。
