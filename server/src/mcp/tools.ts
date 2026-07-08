/**
 * MCP 工具实现
 *
 * 基于候选人真实知识库暴露 5 个工具：
 * 1. search_resume      — 语义搜索简历知识库
 * 2. get_tech_stack     — 获取技术栈
 * 3. get_project_experience — 获取项目经验
 * 4. get_performance_metrics — 获取性能优化数据
 * 5. get_stability_achievements — 获取稳定性成果
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { retrieveRelevantChunks } from '../services/retriever.js';
import type { MCPTool, MCPToolResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KNOWLEDGE_DIR = resolve(__dirname, '../../../knowledge');

// ── Tool 1: search_resume ──────────────────────────────────

async function searchResume(args: Record<string, unknown>): Promise<MCPToolResult> {
  const query = String(args.query || '');
  const topK = typeof args.topK === 'number' ? args.topK : 3;
  const { chunks } = await retrieveRelevantChunks(query, topK);

  return {
    content: [{
      type: 'text',
      text: chunks.length > 0
        ? chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`).join('\n\n')
        : '未找到相关内容',
    }],
  };
}

// ── Tool 2: get_tech_stack ─────────────────────────────────

async function getTechStack(_args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const content = readFileSync(resolve(KNOWLEDGE_DIR, '01-个人概述.md'), 'utf-8');
    const match = content.match(/## 技术栈([\s\S]*?)(?=##|$)/);
    return {
      content: [{
        type: 'text',
        text: match ? match[1].trim() : content.slice(0, 800),
      }],
    };
  } catch {
    return { content: [{ type: 'text', text: '未找到技术栈文档' }] };
  }
}

// ── Tool 3: get_project_experience ─────────────────────────

async function getProjectExperience(args: Record<string, unknown>): Promise<MCPToolResult> {
  const files = ['08-接送列表架构.md', '03-稳定性建设.md', '10-性能优化.md'];
  const nameFilter = String(args.projectName || '').toLowerCase();

  let result = '';
  for (const file of files) {
    try {
      if (nameFilter && !file.toLowerCase().includes(nameFilter)) continue;
      const content = readFileSync(resolve(KNOWLEDGE_DIR, file), 'utf-8');
      result += `## ${file.replace('.md', '')}\n${content.slice(0, 1200)}\n\n---\n\n`;
    } catch {
      // skip missing file
    }
  }

  return {
    content: [{
      type: 'text',
      text: result.trim() || '未找到项目经验',
    }],
  };
}

// ── Tool 4: get_performance_metrics ────────────────────────

async function getPerformanceMetrics(_args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const content = readFileSync(resolve(KNOWLEDGE_DIR, '10-性能优化.md'), 'utf-8');
    return {
      content: [{
        type: 'text',
        text: content.trim().slice(0, 1500),
      }],
    };
  } catch {
    return { content: [{ type: 'text', text: '未找到性能优化文档' }] };
  }
}

// ── Tool 5: get_stability_achievements ─────────────────────

async function getStabilityAchievements(_args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const content = readFileSync(resolve(KNOWLEDGE_DIR, '03-稳定性建设.md'), 'utf-8');
    // 优先提取"主要成果"部分
    const match = content.match(/## 四、主要成果([\s\S]*?)(?=## |$)/);
    return {
      content: [{
        type: 'text',
        text: match ? match[1].trim() : content.trim().slice(0, 1200),
      }],
    };
  } catch {
    return { content: [{ type: 'text', text: '未找到稳定性建设文档' }] };
  }
}

// ── 工具注册表 ─────────────────────────────────────────────

export const MCP_TOOLS: Array<{
  definition: MCPTool;
  handler: (args: Record<string, unknown>) => Promise<MCPToolResult>;
}> = [
  {
    definition: {
      name: 'search_resume',
      description:
        '语义搜索简历知识库。根据关键词检索候选人的项目经验、技术细节、工作成果等。适合开放式问题，如"说说你的项目"、"做过性能优化吗"。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如"项目经验"、"性能优化"、"SSR架构"、"稳定性建设"',
          },
          topK: {
            type: 'number',
            description: '返回结果条数，默认3条，最多5条',
          },
        },
        required: ['query'],
      },
    },
    handler: searchResume,
  },
  {
    definition: {
      name: 'get_tech_stack',
      description:
        '获取候选人的完整技术栈。包括前端框架（React/Vue/Rax）、跨端方案（小程序/H5/一码多端）、AI方向（Agent/RAG/Harness）等。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: getTechStack,
  },
  {
    definition: {
      name: 'get_project_experience',
      description:
        '获取候选人的项目经验详情。包括接送列表架构、稳定性建设、性能优化等核心项目的完整信息。',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: {
            type: 'string',
            description: '可选：指定项目名称过滤，如"接送列表"、"稳定性"',
          },
        },
      },
    },
    handler: getProjectExperience,
  },
  {
    definition: {
      name: 'get_performance_metrics',
      description:
        '获取性能优化的关键数据。包括秒开率（13%→80%）、SSR方案、预请求策略、轮询治理等具体指标和手段。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: getPerformanceMetrics,
  },
  {
    definition: {
      name: 'get_stability_achievements',
      description:
        '获取稳定性建设的主要成果。包括排查线上问题30+、JS Error有效告警率95%、0 P级故障、一键定位工具等。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: getStabilityAchievements,
  },
];
