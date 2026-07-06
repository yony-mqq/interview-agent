import { useState, useEffect, useCallback } from 'react';
import type { Conversation } from '../types/conversation.js';
import { getAuthHeaders } from '../utils/auth.js';
import { API_BASE_URL } from '../config.js';

interface UseConversationsOptions {
  userId: string;
}

export function useConversations({ userId }: UseConversationsOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/conversations?user_id=${encodeURIComponent(userId)}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('[useConversations] fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/conversations?user_id=${encodeURIComponent(userId)}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setConversations(data.conversations || []);
        }
      } catch (error) {
        console.error('[useConversations] fetch error:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    doFetch();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const createConversation = useCallback(async () => {
    if (!userId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/conversations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const conversation: Conversation = await res.json();
      setConversations(prev => [conversation, ...prev]);
      return conversation;
    } catch (error) {
      console.error('[useConversations] create error:', error);
      return null;
    }
  }, [userId]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!userId) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/conversations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (error) {
      console.error('[useConversations] delete error:', error);
      return false;
    }
  }, [userId]);

  return {
    conversations,
    isLoading,
    fetchConversations,
    createConversation,
    deleteConversation,
  };
}
