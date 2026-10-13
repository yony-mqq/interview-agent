import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 server/.env 中的环境变量
config({ path: path.resolve(__dirname, "../server/.env") });

// ─── 配置 ───────────────────────────────────────────────────────────────────────
const KNOWLEDGE_DIR = path.resolve(__dirname, "../knowledge");
const DATA_DIR = path.resolve(__dirname, "../server/data");
const VECTORS_PATH = path.join(DATA_DIR, "vectors.json");
const META_PATH = path.join(DATA_DIR, "vectors-meta.json");

const CHUNK_MIN = 500;
const CHUNK_MAX = 800;
const BATCH_SIZE = 10; // DashScope text-embedding-v3 每批最多 10 条

// ─── DashScope OpenAI 兼容客户端 ────────────────────────────────────────────────
const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

// ─── 类型定义 ────────────────────────────────────────────────────────────────────
interface Chunk {
  id: string;
  source: string;
  title: string;
  content: string;
  embedding: number[];
}

interface VectorsFile {
  chunks: Chunk[];
}

interface MetaFile {
  files: Record<string, string>;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────────

/** 计算文件内容的 MD5 hash */
function md5(content: string): string {
  return crypto.createHash("md5").update(content, "utf-8").digest("hex");
}

/** 读取已有的 meta 文件 */
function loadMeta(): MetaFile {
  if (fs.existsSync(META_PATH)) {
    return JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  }
  return { files: {} };
}

/** 读取已有的 vectors 文件 */
function loadVectors(): VectorsFile {
  if (fs.existsSync(VECTORS_PATH)) {
    return JSON.parse(fs.readFileSync(VECTORS_PATH, "utf-8"));
  }
  return { chunks: [] };
}

/**
 * 按 ## 标题切分 Markdown 为 chunks
 * 如果一个 section 太短则合并相邻 section，目标 500-800 字
 */
function splitMarkdown(
  content: string,
  filename: string
): { title: string; content: string; id: string }[] {
  const lines = content.split("\n");

  // 提取文档级 H1 标题（# 开头的第一行主标题）
  let docTitle = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      docTitle = trimmed.replace(/^#\s+/, "").trim();
      break;
    }
  }

  const sections: { title: string; lines: string[] }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // 保存前一个 section
      if (currentLines.length > 0 || currentTitle) {
        sections.push({ title: currentTitle, lines: [...currentLines] });
      }
      currentTitle = line.replace(/^##\s+/, "").trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  // 最后一个 section
  if (currentLines.length > 0 || currentTitle) {
    sections.push({ title: currentTitle, lines: [...currentLines] });
  }

  // 合并过短的相邻 section
  const merged: { title: string; content: string }[] = [];
  let buffer = { title: "", content: "" };

  for (const section of sections) {
    const sectionContent = section.lines.join("\n").trim();
    if (!buffer.title) {
      buffer.title = section.title;
      buffer.content = sectionContent;
    } else if (buffer.content.length + sectionContent.length < CHUNK_MIN) {
      // 合并
      buffer.title = buffer.title || section.title;
      buffer.content += "\n\n" + (section.title ? `## ${section.title}\n` : "") + sectionContent;
    } else {
      merged.push({ ...buffer });
      buffer = { title: section.title, content: sectionContent };
    }
  }
  if (buffer.title || buffer.content) {
    merged.push(buffer);
  }

  // 如果合并后仍超过 CHUNK_MAX，进一步拆分
  const baseName = filename.replace(/\.md$/, "");
  const result: { title: string; content: string; id: string }[] = [];
  let chunkIndex = 0;

  for (const item of merged) {
    // 将文档级 H1 标题注入到每个 chunk 的 content 开头，提升检索命中率
    const docTitlePrefix = docTitle ? `# ${docTitle}\n\n` : "";

    if (item.content.length <= CHUNK_MAX) {
      result.push({
        title: item.title,
        content: docTitlePrefix + item.content,
        id: `${baseName}_chunk_${chunkIndex++}`,
      });
    } else {
      // 按段落拆分
      const paragraphs = item.content.split(/\n\n+/);
      let subContent = "";
      for (const para of paragraphs) {
        if (subContent.length + para.length > CHUNK_MAX && subContent.length > 0) {
          result.push({
            title: item.title,
            content: docTitlePrefix + subContent.trim(),
            id: `${baseName}_chunk_${chunkIndex++}`,
          });
          subContent = para;
        } else {
          subContent += (subContent ? "\n\n" : "") + para;
        }
      }
      if (subContent.trim()) {
        result.push({
          title: item.title,
          content: docTitlePrefix + subContent.trim(),
          id: `${baseName}_chunk_${chunkIndex++}`,
        });
      }
    }
  }

  return result;
}

/** 批量调用 DashScope embedding API */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    console.log(`  → 请求 embedding 批次 ${Math.floor(i / BATCH_SIZE) + 1}（${batch.length} 条）`);

    const response = await client.embeddings.create({
      model: "text-embedding-v3",
      input: batch,
    });

    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔨 开始构建知识库索引...\n");

  // 确保输出目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 加载已有数据
  const meta = loadMeta();
  const existingVectors = loadVectors();

  // 获取所有 md 文件
  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("⚠️  knowledge/ 目录下没有找到 .md 文件");
    return;
  }

  console.log(`📂 发现 ${files.length} 个知识文件：${files.join(", ")}\n`);

  // 判断哪些文件需要更新
  const filesToProcess: string[] = [];
  const fileHashes: Record<string, string> = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
    const hash = md5(content);
    fileHashes[file] = hash;

    if (meta.files[file] !== hash) {
      filesToProcess.push(file);
    }
  }

  if (filesToProcess.length === 0) {
    console.log("✅ 所有文件均为最新，无需更新。");
    return;
  }

  console.log(`🔄 需要处理的文件（${filesToProcess.length}）：${filesToProcess.join(", ")}\n`);

  // 移除已变更文件的旧 chunks
  const unchangedChunks = existingVectors.chunks.filter(
    (chunk) => !filesToProcess.includes(chunk.source)
  );

  // 切分新文件
  const newChunks: { id: string; source: string; title: string; content: string }[] = [];

  for (const file of filesToProcess) {
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
    const chunks = splitMarkdown(content, file);
    console.log(`  📄 ${file} → ${chunks.length} 个 chunks`);

    for (const chunk of chunks) {
      newChunks.push({
        id: chunk.id,
        source: file,
        title: chunk.title,
        content: chunk.content,
      });
    }
  }

  console.log(`\n📊 共 ${newChunks.length} 个新 chunks 需要生成 embedding\n`);

  // 获取 embedding
  const texts = newChunks.map((c) => `${c.title}\n${c.content}`);
  const embeddings = await getEmbeddings(texts);

  // 组装最终数据
  const finalChunks: Chunk[] = [
    ...unchangedChunks,
    ...newChunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i],
    })),
  ];

  // 写入 vectors.json
  const vectorsData: VectorsFile = { chunks: finalChunks };
  fs.writeFileSync(VECTORS_PATH, JSON.stringify(vectorsData, null, 2), "utf-8");
  console.log(`\n💾 已写入 ${VECTORS_PATH}（共 ${finalChunks.length} 个 chunks）`);

  // 更新 meta
  const newMeta: MetaFile = { files: fileHashes };
  fs.writeFileSync(META_PATH, JSON.stringify(newMeta, null, 2), "utf-8");
  console.log(`💾 已写入 ${META_PATH}`);

  console.log("\n✅ 知识库索引构建完成！");
}

main().catch((err) => {
  console.error("❌ 构建失败：", err);
  process.exit(1);
});
