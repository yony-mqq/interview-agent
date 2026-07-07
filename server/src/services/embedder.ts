import crypto from 'crypto';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 内存缓存：相同 query 的 Embedding 不用重复请求 API
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX_SIZE = 500;

function md5(text: string): string {
  return crypto.createHash('md5').update(text, 'utf-8').digest('hex');
}

export async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = md5(text.trim());

  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-v3',
      input: text,
    });

    const embedding = response.data[0].embedding;

    // 缓存控制：超过上限时清空旧缓存
    if (embeddingCache.size >= CACHE_MAX_SIZE) {
      embeddingCache.clear();
    }
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (error) {
    console.error('[Embedder] Failed to get embedding:', error);
    throw new Error('Embedding service unavailable');
  }
}
