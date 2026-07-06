export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: Message[];
  user_id?: string;
  conversation_id?: string;
}

export interface VectorChunk {
  id: string;
  source: string;
  title: string;
  content: string;
  embedding: number[];
}

export interface VectorStore {
  chunks: VectorChunk[];
}
