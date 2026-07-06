import { useState, useCallback } from 'react';
import type { Message } from '../types/conversation.js';
import { getAuthHeaders } from '../utils/auth.js';
import { API_BASE_URL } from '../config.js';

interface UseMessagesOptions {
  conversationId: string | null;
  userId: string;
}

export function useMessages({ conversationId, userId }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMessages = useCallback(async (): Promise<Message[]> => {
    if (!conversationId || !userId) return [];

    setIsLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages?user_id=${encodeURIComponent(userId)}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const fetched = data.messages || [];
      setMessages(fetched);
      return fetched;
    } catch (error) {
      console.error('[useMessages] fetch error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, userId]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateAssistantMessage = useCallback((content: string) => {
    setMessages(prev => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0 || prev[lastIndex].role !== 'assistant') return prev;

      const updated = [...prev];
      updated[lastIndex] = { ...updated[lastIndex], content: updated[lastIndex].content + content };
      return updated;
    });
  }, []);

  const resetMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    fetchMessages,
    addMessage,
    updateAssistantMessage,
    resetMessages,
  };
}
