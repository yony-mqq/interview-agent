import { useState } from 'react';
import type { Message, ThinkingStep } from '../../types/conversation';

interface MessageBubbleProps {
  message: Message;
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
    .replace(/'/g, '&#39;');

  // **加粗** -> <strong>加粗</strong>
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 换行 -> <br/>
  return withBold.replace(/\n/g, '<br/>');
}

/**
 * 思考步骤折叠面板
 */
function ThinkingPanel({
  steps,
  isStreaming,
}: {
  steps: ThinkingStep[];
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(isStreaming);

  if (steps.length === 0) return null;

  const typeStyle = (type: ThinkingStep['type']) => {
    switch (type) {
      case 'thought':
        return 'tw-bg-blue-50 tw-text-blue-700';
      case 'tool_call':
        return 'tw-bg-amber-50 tw-text-amber-700';
      case 'tool_result':
        return 'tw-bg-green-50 tw-text-green-700';
    }
  };

  return (
    <div className="tw-mb-2 tw-border-b tw-border-gray-200/60 tw-pb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-text-gray-500 hover:tw-text-gray-700 tw-transition-colors"
      >
        <span className="tw-text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span>🤔 思考过程（{steps.length} 步）</span>
      </button>

      {expanded && (
        <div className="tw-mt-1.5 tw-space-y-1.5">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`tw-flex tw-items-start tw-gap-2 tw-text-xs tw-rounded-lg tw-px-2.5 tw-py-1.5 ${typeStyle(step.type)}`}
            >
              <span className="tw-flex-shrink-0 tw-leading-4">{step.icon}</span>
              <div className="tw-min-w-0 tw-leading-4">
                <div className="tw-font-medium">{step.title}</div>
                <div className="tw-opacity-80 tw-truncate" title={step.content}>
                  {step.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`tw-flex ${isUser ? 'tw-justify-end' : 'tw-justify-start'} tw-mb-3`}>
      <div
        className={`tw-max-w-[80%] tw-px-3.5 tw-py-2.5 tw-rounded-xl tw-text-sm tw-leading-relaxed tw-break-words ${
          isUser
            ? 'tw-bg-[#1B365D] tw-text-white tw-rounded-br-sm'
            : 'tw-bg-[#f3f4f6] tw-text-gray-800 tw-rounded-bl-sm'
        }`}
      >
        {/* Assistant 消息：展示思考过程折叠面板 */}
        {!isUser && message.thinkingSteps && message.thinkingSteps.length > 0 && (
          <ThinkingPanel steps={message.thinkingSteps} isStreaming={isStreaming} />
        )}

        {/* 消息内容 */}
        {message.content && (
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        )}

        {/* 空内容时的加载动画（等待第一个字） */}
        {isStreaming && !message.content && (
          <span className="tw-inline-flex tw-items-center tw-gap-1">
            <span
              className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="tw-w-1.5 tw-h-1.5 tw-bg-gray-400 tw-rounded-full tw-animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </span>
        )}

        {/* 内容生成中的闪烁光标 */}
        {isStreaming && message.content && (
          <span className="tw-inline-block tw-w-1 tw-h-4 tw-ml-0.5 tw-bg-gray-400 tw-animate-pulse tw-align-middle" />
        )}
      </div>
    </div>
  );
}
