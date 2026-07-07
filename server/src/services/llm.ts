import OpenAI from 'openai';
import type { Message } from '../types/index.js';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 30000,
});

export async function* streamChat(
  messages: Message[],
  model: 'qwen-plus' | 'qwen-turbo' = 'qwen-plus'
): AsyncGenerator<string, void, undefined> {
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      max_tokens: model === 'qwen-turbo' ? 600 : 1000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error('[LLM] Stream chat error:', error);
    throw new Error('LLM service unavailable');
  }
}
