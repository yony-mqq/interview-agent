import { useState, useRef, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort?: () => void;
  isLoading?: boolean;
  isRecording?: boolean;
  isRecognizing?: boolean;
  onToggleVoice?: () => void;
}

export function ChatInput({
  onSend,
  onAbort,
  isLoading,
  isRecording,
  isRecognizing,
  onToggleVoice,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const text = value.trim()
    if (!text || isLoading) return
    onSend(text)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 100) + 'px'
    }
  }

  const showVoiceButton = !isLoading && onToggleVoice

  return (
    <div className="tw-flex tw-items-end tw-gap-2 tw-p-3 tw-border-t tw-border-gray-200 tw-bg-white tw-rounded-b-xl">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={isRecording ? '正在录音，点击麦克风结束' : '输入你的问题...'}
        disabled={isLoading || isRecording}
        rows={1}
        className="tw-flex-1 tw-resize-none tw-border tw-border-gray-300 tw-rounded-lg tw-px-3 tw-py-2 tw-text-sm tw-outline-none tw-transition focus:tw-border-[#1B365D] focus:tw-ring-1 focus:tw-ring-[#1B365D] disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
      />

      {showVoiceButton && (
        <button
          onClick={onToggleVoice}
          disabled={isRecognizing}
          className={`tw-flex-shrink-0 tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-transition ${
            isRecording
              ? 'tw-bg-red-500 tw-text-white tw-animate-pulse'
              : 'tw-bg-gray-100 tw-text-gray-600 hover:tw-bg-gray-200'
          } disabled:tw-opacity-40 disabled:tw-cursor-not-allowed`}
          title={isRecording ? '结束录音' : '语音输入'}
        >
          {isRecognizing ? (
            <svg className="tw-animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      )}

      {isLoading ? (
        <button
          onClick={onAbort}
          className="tw-flex-shrink-0 tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-bg-[#1B365D] tw-text-white tw-transition hover:tw-opacity-90"
          title="停止生成"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!value.trim() || isRecording || isRecognizing}
          className="tw-flex-shrink-0 tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-bg-[#1B365D] tw-text-white tw-transition hover:tw-opacity-90 disabled:tw-opacity-40 disabled:tw-cursor-not-allowed"
          title="发送"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      )}
    </div>
  )
}
