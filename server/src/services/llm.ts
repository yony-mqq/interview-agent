import OpenAI from 'openai';
import type { Message } from '../types/index.js';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 30000,
});

export async function* streamChat(
  messages: Message[]
): AsyncGenerator<string, void, undefined> {
  try {
    const stream = await client.chat.completions.create({
      model: 'qwen-plus',
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
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
