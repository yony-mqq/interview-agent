/**
 * 评测集题目挖掘脚本
 *
 * 遍历 knowledge/*.md，从每篇文档中挖掘 5-10 个面试官可能问的问题。
 * 输出 candidates.json，供人工筛选后生成最终 dataset。
 *
 * 用法：
 *   cd scripts && npx tsx eval/mine-questions.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 server/.env
config({ path: path.resolve(__dirname, '../../server/.env') });

const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');
const OUTPUT_PATH = path.resolve(__dirname, 'candidates.json');

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

interface Candidate {
  source: string;
  questions: string[];
}

/**
 * 从单篇文档挖掘候选题目
 */
async function mineQuestions(docPath: string, docName: string): Promise<string[]> {
  const content = fs.readFileSync(docPath, 'utf-8');

  // 过滤掉太短的文档
  if (content.length < 200) {
    console.log(`  ⏭️  ${docName} 太短，跳过`);
    return [];
  }

  const prompt = `你是一位面试题设计专家。请阅读以下个人项目/技术文档，从中挖掘出 5-8 个面试官可能问的问题。

要求：
1. 每个问题必须能从文档中找到答案依据
2. 问题类型覆盖：
   - 事实型（What / How much）："用的是什么技术？""数据是多少？"
   - 原理型（Why / How）："为什么这样设计？""怎么解决的？"
   - 行为型（最有挑战的事）："过程中遇到什么困难？"
3. 问题要简洁明确，不要带答案
4. 不要编造文档中没有的信息

文档标题：${docName}
文档内容（前 3000 字）：
${content.slice(0, 3000)}

请严格按以下格式输出（每行一个，带序号）：
1. 问题内容
2. 问题内容
...`;

  try {
    const response = await client.chat.completions.create({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 800,
    });

    const raw = response.choices[0]?.message?.content || '';

    // 解析带序号的问题
    const questions = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d+[\.\)]\s*/.test(l))
      .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((l) => l.length > 5 && l.length < 100);

    return questions;
  } catch (error) {
    console.error(`  ❌ 挖掘失败 ${docName}:`, error);
    return [];
  }
}

async function main() {
  console.log('🔨 开始挖掘评测集候选题目...\n');

  // 获取所有 md 文件
  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  console.log(`📂 发现 ${files.length} 个知识文件\n`);

  const candidates: Candidate[] = [];
  let totalQuestions = 0;

  for (const file of files) {
    const docPath = path.join(KNOWLEDGE_DIR, file);
    console.log(`📄 ${file}`);

    const questions = await mineQuestions(docPath, file);
    totalQuestions += questions.length;

    if (questions.length > 0) {
      candidates.push({ source: file, questions });
      questions.forEach((q) => console.log(`   • ${q}`));
    }

    console.log();
  }

  // 写入 candidates.json
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(candidates, null, 2), 'utf-8');

  console.log(`✅ 完成！共挖掘 ${totalQuestions} 个候选题目`);
  console.log(`💾 已写入 ${OUTPUT_PATH}`);
  console.log(`\n下一步：人工筛选后，运行 npx tsx eval/generate-answers.ts 生成标准答案`);
}

main().catch((err) => {
  console.error('❌ 失败：', err);
  process.exit(1);
});
