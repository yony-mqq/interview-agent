import { useState, useCallback, useRef } from 'react';
import type { Message } from '../types/conversation.js';
import { getAuthHeaders } from '../utils/auth.js';

interface UseChatOptions {
  apiUrl: string;
  userId: string;
  conversationId: string | null;
}

export function useChat({ apiUrl, userId, conversationId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 使用 ref 保证回调中始终访问到最新的状态和 props
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const loadMessages = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
  }, []);

  const resetMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMessage: Message = { role: 'user', content: text };
      const assistantMessage: Message = { role: 'assistant', content: '' };

      setMessagesRef.current(prev => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            message: text,
            user_id: userId,
            conversation_id: conversationIdRef.current,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.content) {
                  setMessagesRef.current(prev => {
                    const last = prev[prev.length - 1];
                    if (!last || last.role !== 'assistant') return prev;
                    return [
                      ...prev.slice(0, -1),
                      { ...last, content: last.content + parsed.content },
                    ];
                  });
                }
              } catch {
                // skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('[useChat] Request aborted by user');
        } else {
          console.error('[useChat] error:', error);
          setMessagesRef.current(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content || '抱歉，请求出错了，请稍后重试。' },
            ];
          });
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [apiUrl, userId]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    abort,
    loadMessages,
    resetMessages,
  };
}
