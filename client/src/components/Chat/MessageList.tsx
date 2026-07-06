import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types/conversation'

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="tw-flex-1 tw-overflow-y-auto tw-overscroll-contain tw-px-4 tw-py-3">
      {messages.map((msg, idx) => (
        <MessageBubble
          key={`${idx}-${msg.role}`}
          message={msg}
          isStreaming={
            isLoading &&
            msg.role === 'assistant' &&
            idx === messages.length - 1
          }
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
