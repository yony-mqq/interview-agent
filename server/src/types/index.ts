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

// ── SSE 流事件类型（Agent 思考过程可视化）─────────────────────

export interface ThoughtEvent {
  type: 'thought';
  content: string;
  step: number;
}

export interface ToolCallEvent {
  type: 'tool_call';
  name: string;
  input: string;
}

export interface ToolResultEvent {
  type: 'tool_result';
  name: string;
  output: string;
}

export interface ContentEvent {
  type: 'content';
  content: string;
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

export type StreamEvent = ThoughtEvent | ToolCallEvent | ToolResultEvent | ContentEvent | ErrorEvent;
