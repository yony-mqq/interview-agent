export interface ThinkingStep {
  id: string;
  type: 'thought' | 'tool_call' | 'tool_result';
  icon: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  thinkingSteps?: ThinkingStep[];
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

// ── SSE 流事件类型（与后端对齐）─────────────────────────────

export interface StreamEvent {
  type: 'thought' | 'tool_call' | 'tool_result' | 'content' | 'error';
  content?: string;
  step?: number;
  name?: string;
  input?: string;
  output?: string;
  error?: string;
}
