interface MessageBubbleProps {
  message: { role: 'user' | 'assistant'; content: string };
  isStreaming?: boolean;
}

// 简易 Markdown 渲染：支持 **加粗** 与换行
function renderMarkdown(text: string): string {
  // 先转义 HTML 特殊字符，避免 XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // **加粗** -> <strong>加粗</strong>
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // 换行 -> <br/>
  return withBold.replace(/\n/g, '<br/>')
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`tw-flex ${isUser ? 'tw-justify-end' : 'tw-justify-start'} tw-mb-3`}>
      <div
        className={`tw-max-w-[80%] tw-px-3.5 tw-py-2.5 tw-rounded-xl tw-text-sm tw-leading-relaxed tw-break-words ${
          isUser
            ? 'tw-bg-[#1B365D] tw-text-white tw-rounded-br-sm'
            : 'tw-bg-[#f3f4f6] tw-text-gray-800 tw-rounded-bl-sm'
        }`}
      >
        {message.content && (
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        )}
        {isStreaming && !message.content && (
          <span className="tw-inline-flex tw-items-center tw-gap-1">
            <span className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        {isStreaming && message.content && (
          <span className="tw-inline-block tw-w-1 tw-h-4 tw-ml-0.5 tw-bg-gray-400 tw-animate-pulse tw-align-middle" />
        )}
      </div>
    </div>
  )
}
