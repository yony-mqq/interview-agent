/**
 * 评测集标准答案生成脚本
 *
 * 读取 eval/candidates.json（人工筛选后的题目），
 * 基于 RAG 检索知识库原文，生成 Golden Answer。
 *
 * 用法：
 *   cd scripts && npx tsx eval/generate-answers.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../../server/.env') });

const CANDIDATES_PATH = path.resolve(__dirname, 'candidates.json');
const DATASET_PATH = path.resolve(__dirname, 'dataset.json');
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

interface CandidateItem {
  source: string;
  questions: string[];
}

interface EvalItem {
  id: string;
  category: string;
  question: string;
  golden_answer: string;
  source_doc: string;
  evaluation_criteria: string[];
  must_include: string[];
}

/**
 * 从知识库中检索和题目相关的原文片段
 */
async function retrieveRelevantChunks(
  query: string,
  sourceDoc: string,
  topK: number = 3
): Promise<Array<{ title: string; content: string }>> {
  const docPath = path.join(KNOWLEDGE_DIR, sourceDoc);
  if (!fs.existsSync(docPath)) {
    return [];
  }

  const content = fs.readFileSync(docPath, 'utf-8');

  // 简单切分：按 ## 标题分段
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentLines.join('\n').trim(),
        });
      }
      currentTitle = line.replace(/^##\s+/, '').trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }

  // 简单关键词匹配（不用 Embedding，直接用字符串匹配）
  const keywords = query
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const scored = sections.map((section) => {
    const text = (section.title + ' ' + section.content).toLowerCase();
    const score = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
    return { section, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.section);
}

/**
 * 基于原文片段生成标准答案
 */
async function generateGoldenAnswer(
  question: string,
  chunks: Array<{ title: string; content: string }>
): Promise<string> {
  const contextText = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.content.slice(0, 600)}`)
    .join('\n\n');

  const prompt = `你是一位面试回答撰写专家。请根据以下文档片段，为问题写出一份标准参考答案（Golden Answer）。

严格要求：
1. 答案中的所有事实、数据、技术细节必须来自提供的文档片段
2. 不要编造文档中没有的信息
3. 用第一人称"我"来回答
4. 控制在 200 字以内，简洁有力
5. 优先使用要点列表，不要大段文字

问题：${question}

参考文档片段：
${contextText}

请输出标准答案：`;

  const response = await client.chat.completions.create({
    model: 'qwen-plus',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 400,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * 生成 evaluation_criteria（让 LLM 判断应该包含哪些要点）
 */
async function generateCriteria(
  question: string,
  answer: string
): Promise<{ criteria: string[]; must_include: string[] }> {
  const prompt = `基于以下面试问题和参考答案，输出评测标准。

问题：${question}
参考答案：${answer}

请输出：
1. 3-5 条 evaluation_criteria（评分维度，每条一句话）
2. 3-5 个 must_include 关键词（Agent 回答中必须包含的关键词）

格式：
criteria:
- 标准1
- 标准2
must_include:
- 关键词1
- 关键词2`;

  const response = await client.chat.completions.create({
    model: 'qwen-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 300,
  });

  const raw = response.choices[0]?.message?.content || '';

  const criteria = raw
    .split('must_include:')[0]
    .split('criteria:')[1] || '';
  const mustInclude = raw.split('must_include:')[1] || '';

  return {
    criteria: criteria
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim()),
    must_include: mustInclude
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim()),
  };
}

async function main() {
  console.log('🔨 开始生成评测集标准答案...\n');

  if (!fs.existsSync(CANDIDATES_PATH)) {
    console.error(`❌ 未找到 ${CANDIDATES_PATH}`);
    console.error('请先运行：npx tsx eval/mine-questions.ts');
    process.exit(1);
  }

  const candidates: CandidateItem[] = JSON.parse(
    fs.readFileSync(CANDIDATES_PATH, 'utf-8')
  );

  const dataset: EvalItem[] = [];
  let idCounter = 1;

  for (const item of candidates) {
    console.log(`📄 ${item.source}（${item.questions.length} 题）`);

    for (const question of item.questions) {
      console.log(`   Q: ${question.slice(0, 50)}...`);

      // 1. 检索相关原文
      const chunks = await retrieveRelevantChunks(question, item.source, 3);

      // 2. 生成标准答案
      const goldenAnswer = await generateGoldenAnswer(question, chunks);

      // 3. 生成评测标准
      const { criteria, must_include } = await generateCriteria(question, goldenAnswer);

      // 4. 推断分类
      const category = inferCategory(question, item.source);

      dataset.push({
        id: `q${String(idCounter).padStart(3, '0')}`,
        category,
        question,
        golden_answer: goldenAnswer,
        source_doc: item.source,
        evaluation_criteria: criteria.length > 0 ? criteria : ['回答必须基于事实'],
        must_include: must_include,
      });

      idCounter++;
    }

    console.log();
  }

  // 写入 dataset.json
  fs.writeFileSync(DATASET_PATH, JSON.stringify(dataset, null, 2), 'utf-8');

  console.log(`✅ 完成！共生成 ${dataset.length} 道评测题`);
  console.log(`💾 已写入 ${DATASET_PATH}`);
  console.log(`\n⚠️ 重要：请务必人工校验 dataset.json 中的答案准确性！`);
  console.log(`   特别是包含数字、百分比、技术栈的题目。`);
}

/**
 * 根据问题和文档名推断分类
 */
function inferCategory(question: string, sourceDoc: string): string {
  const q = question.toLowerCase();
  const doc = sourceDoc.toLowerCase();

  if (doc.includes('稳定性') || q.includes('监控') || q.includes('告警')) return '稳定性';
  if (doc.includes('性能') || q.includes('优化') || q.includes('秒开')) return '性能优化';
  if (doc.includes('架构') || doc.includes('设计') || q.includes('架构')) return '项目经验';
  if (doc.includes('ai') || doc.includes('agent') || doc.includes('工程化')) return 'AI/Agent';
  if (doc.includes('组件') || q.includes('组件')) return '工程化';
  if (doc.includes('概述') || q.includes('技术栈') || q.includes('经验')) return '技术栈';

  return '综合';
}

main().catch((err) => {
  console.error('❌ 失败：', err);
  process.exit(1);
});
