import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getEmbedding } from './embedder.js';
import type { VectorChunk, VectorStore } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  scored.sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;

  const topChunks = scored
    .slice(0, topK)
    .filter((item) => item.score >= SIMILARITY_THRESHOLD)
    .map((item) => item.chunk);

  console.log(
    `[Retriever] Retrieved ${topChunks.length} chunks for query: "${query.slice(0, 50)}..." ` +
      `(best score: ${bestScore.toFixed(3)})`
  );

  return { chunks: topChunks, bestScore };
}
