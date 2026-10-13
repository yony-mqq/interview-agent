import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getEmbedding } from './embedder.js';
import type { VectorChunk, VectorStore } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Rerank 配置 ────────────────────────────────────────────────────────────────
// DashScope 兼容模式支持 gte-rerank / bge-reranker 等 rerank 模型
const RERANK_ENABLED = process.env.RERANK_ENABLED !== 'false'; // 默认开启
const RERANK_MODEL = process.env.RERANK_MODEL || 'gte-rerank';
const RERANK_INITIAL_K = Number(process.env.RERANK_INITIAL_K || '20'); // 粗排取前 20
const RERANK_TOP_K = Number(process.env.RERANK_TOP_K || '5'); // 精排后取前 5
const RERANK_BASE_URL = process.env.RERANK_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const RERANK_API_KEY = process.env.DASHSCOPE_API_KEY || '';

let vectorStore: VectorStore | null = null;

function loadVectorStore(): VectorStore {
  if (vectorStore) return vectorStore;

  const vectorsPath = process.env.VECTORS_PATH
    ? resolve(process.cwd(), process.env.VECTORS_PATH)
    : resolve(__dirname, '../../data/vectors.json');

  try {
    const data = readFileSync(vectorsPath, 'utf-8');
    vectorStore = JSON.parse(data) as VectorStore;
    console.log(`[Retriever] Loaded ${vectorStore.chunks.length} chunks from ${vectorsPath}`);
    return vectorStore;
  } catch (error) {
    console.warn(`[Retriever] Failed to load vectors from ${vectorsPath}:`, error);
    vectorStore = { chunks: [] };
    return vectorStore;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

const SIMILARITY_THRESHOLD = 0.65;

export interface RetrievalResult {
  chunks: VectorChunk[];
  bestScore: number;
}

/** Rerank 模型单条结果 */
interface RerankResult {
  index: number;
  relevance_score: number;
}

/** 调用 DashScope 兼容模式的 Rerank API */
async function callRerank(
  query: string,
  documents: string[]
): Promise<RerankResult[]> {
  try {
    const response = await fetch(`${RERANK_BASE_URL}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RERANK_API_KEY}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        top_n: RERANK_TOP_K,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Rerank] API error ${response.status}: ${errText}`);
      return [];
    }

    const data = (await response.json()) as {
      results?: Array<{ index: number; relevance_score: number }>;
    };

    return (data.results || []).map((r) => ({
      index: r.index,
      relevance_score: r.relevance_score,
    }));
  } catch (error) {
    console.warn('[Rerank] Failed to call rerank API:', error);
    return [];
  }
}

/** 从 chunk content 中提取 H1 标题 */
function extractDocTitle(content: string): string | null {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}

/** 检查 query 与标题是否有子串匹配关系（双向包含） */
function isKeywordMatch(query: string, title: string): boolean {
  const q = query.trim().toLowerCase();
  const t = title.trim().toLowerCase();
  return q.length > 0 && t.length > 0 && (q.includes(t) || t.includes(q));
}

export async function retrieveRelevantChunks(
  query: string,
  topK: number = 3
): Promise<RetrievalResult> {
  const store = loadVectorStore();

  if (store.chunks.length === 0) {
    console.warn('[Retriever] No chunks available for retrieval');
    return { chunks: [], bestScore: 0 };
  }

  const queryEmbedding = await getEmbedding(query);

  const scored = store.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // 标题关键词 fallback：H1 标题与 query 子串匹配的 chunk 强制保底到阈值
  for (const item of scored) {
    const h1 = extractDocTitle(item.chunk.content);
    if (h1 && isKeywordMatch(query, h1)) {
      item.score = Math.max(item.score, SIMILARITY_THRESHOLD);
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;

  // ═══════════════════════════════════════════════════════════════════════════════
  //  Step 1: 粗排 — Embedding 相似度取前 RERANK_INITIAL_K 条（默认 20）
  // ═══════════════════════════════════════════════════════════════════════════════
  const coarseCandidates = scored
    .slice(0, RERANK_INITIAL_K)
    .filter((item) => item.score >= SIMILARITY_THRESHOLD);

  // ═══════════════════════════════════════════════════════════════════════════════
  //  Step 2: 精排 — Rerank 模型重排序，取前 topK（默认 5，最终按调用方需求截断）
  // ═══════════════════════════════════════════════════════════════════════════════
  let finalChunks: VectorChunk[] = [];
  let finalBestScore = bestScore;

  if (RERANK_ENABLED && coarseCandidates.length > 1) {
    const documents = coarseCandidates.map((item) =>
      `${item.chunk.title}\n${item.chunk.content}`.slice(0, 2000)
    );

    const rerankResults = await callRerank(query, documents);

    if (rerankResults.length > 0) {
      // 按 rerank 分数排序，映射回原始 chunk
      const reranked = rerankResults
        .map((r) => ({
          chunk: coarseCandidates[r.index].chunk,
          score: r.relevance_score,
        }))
        .sort((a, b) => b.score - a.score);

      finalChunks = reranked.slice(0, topK).map((item) => item.chunk);
      finalBestScore = reranked[0]?.score ?? 0;

      console.log(
        `[Retriever] Rerank: ${coarseCandidates.length} → ${reranked.length} → ${finalChunks.length} ` +
          `chunks for query: "${query.slice(0, 50)}..." (best rerank score: ${finalBestScore.toFixed(3)})`
      );
    } else {
      // Rerank 失败，回退到粗排结果
      finalChunks = coarseCandidates.slice(0, topK).map((item) => item.chunk);
      console.warn('[Retriever] Rerank failed, fallback to coarse ranking');
    }
  } else {
    // Rerank 关闭或候选不足，直接用粗排结果
    finalChunks = coarseCandidates.slice(0, topK).map((item) => item.chunk);
  }

  console.log(
    `[Retriever] Retrieved ${finalChunks.length} chunks for query: "${query.slice(0, 50)}..." ` +
      `(best score: ${finalBestScore.toFixed(3)})`
  );

  return { chunks: finalChunks, bestScore: finalBestScore };
}
