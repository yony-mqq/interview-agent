import { useEffect, useRef } from 'react'
import { DigitalHumanAvatar } from './DigitalHumanAvatar'
import { ChatInput } from './ChatInput'
import type { Message } from '../../types/conversation'

interface DigitalHumanChatProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  isRecording?: boolean;
  isRecognizing?: boolean;
  onToggleVoice?: () => void;
}

// 简易 Markdown 渲染：支持 **加粗** 与换行
function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export function DigitalHumanChat({
  messages,
  isLoading,
  onSend,
  onAbort,
  isRecording,
  isRecognizing,
  onToggleVoice,
}: DigitalHumanChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 取最后一条消息判断状态
  const lastMessage = messages[messages.length - 1]
  const isAssistantSpeaking = isLoading && lastMessage?.role === 'assistant'
  const isListening = !isLoading && messages.length > 0 && lastMessage?.role === 'user'
  const latestAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="tw-flex-1 tw-flex tw-flex-col tw-min-w-0 tw-overflow-hidden">
      {/* 数字人形象区 */}
      <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-pt-4 tw-pb-2 tw-bg-gradient-to-b tw-from-[#F8FAFC] tw-to-white tw-shrink-0">
        <DigitalHumanAvatar
          isSpeaking={isAssistantSpeaking}
          isListening={isListening}
          size="lg"
        />
        <div className="tw-mt-5 tw-text-center">
          <div className="tw-text-sm tw-font-medium tw-text-gray-800">马倩倩 · 虚拟面试官</div>
          <div className="tw-text-xs tw-text-gray-500 tw-mt-0.5">
            {isAssistantSpeaking ? '正在回答你的问题…' : isListening ? '请继续提问' : '你好，准备好开始面试了吗？'}
          </div>
        </div>
      </div>

      {/* 最近消息区 */}
      <div className="tw-flex-1 tw-overflow-y-auto tw-px-4 tw-py-2 tw-min-h-0">
        {messages.length === 0 ? (
          <div className="tw-h-full tw-flex tw-flex-col tw-items-center tw-justify-center tw-text-center tw-text-gray-400 tw-text-xs tw-gap-2">
            <span className="tw-text-2xl">💬</span>
            <p>在下方输入框开始面试提问</p>
          </div>
        ) : (
          <div className="tw-flex tw-flex-col tw-gap-3">
            {messages.slice(-4).map((msg, idx) => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`tw-flex ${isUser ? 'tw-justify-end' : 'tw-justify-start'}`}
                >
                  {!isUser && (
                    <div className="tw-w-6 tw-h-6 tw-rounded-full tw-bg-gradient-to-br tw-from-[#1B365D] tw-to-[#3B6FBF] tw-flex tw-items-center tw-justify-center tw-text-white tw-text-[10px] tw-mr-2 tw-shrink-0">
                      马
                    </div>
                  )}
                  <div
                    className={`tw-max-w-[75%] tw-px-3 tw-py-2 tw-rounded-xl tw-text-xs tw-leading-relaxed tw-break-words ${
                      isUser
                        ? 'tw-bg-[#1B365D] tw-text-white tw-rounded-br-sm'
                        : 'tw-bg-[#f3f4f6] tw-text-gray-800 tw-rounded-bl-sm'
                    }`}
                  >
                    {msg.content && (
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    )}
                    {isLoading && !isUser && idx === messages.slice(-4).length - 1 && !msg.content && (
                      <span className="tw-inline-flex tw-items-center tw-gap-1">
                        <span className="tw-w-1 tw-h-1 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" />
                        <span className="tw-w-1 tw-h-1 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="tw-w-1 tw-h-1 tw-bg-gray-400 tw-rounded-full tw-animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* 底部当前回复摘要（可选，突出数字人正在说的内容） */}
      {latestAssistantMessage && (
        <div className="tw-px-4 tw-py-2 tw-bg-[#F8FAFC] tw-border-t tw-border-gray-100 tw-shrink-0">
          <div className="tw-text-[10px] tw-text-gray-400 tw-mb-1">当前回复</div>
          <p className="tw-text-xs tw-text-gray-600 tw-line-clamp-2">
            {latestAssistantMessage.content || (isLoading ? '正在思考…' : '')}
          </p>
        </div>
      )}

      <ChatInput
        onSend={onSend}
        onAbort={onAbort}
        isLoading={isLoading}
        isRecording={isRecording}
        isRecognizing={isRecognizing}
        onToggleVoice={onToggleVoice}
      />
    </div>
  )
}
