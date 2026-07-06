import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-v3',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[Embedder] Failed to get embedding:', error);
    throw new Error('Embedding service unavailable');
  }
}
