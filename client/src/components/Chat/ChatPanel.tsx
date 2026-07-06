import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useChat } from '../../hooks/useChat'
import { useConversations } from '../../hooks/useConversations'
import { useMessages } from '../../hooks/useMessages'
import { useSpeech } from '../../hooks/useSpeech'
import { getUserId } from '../../utils/user'
import { API_BASE_URL } from '../../config.js'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ConversationList } from './ConversationList'
import { NewChatButton } from './NewChatButton'
// import { ModeSelector } from './ModeSelector'
import { DigitalHumanChat } from './DigitalHumanChat'
import type { Conversation } from '../../types/conversation'

type ChatMode = 'select' | 'chat' | 'digital-human'

interface ChatPanelProps {
  onClose: () => void;
}

const QUICK_QUESTIONS = [
  '介绍一下你的项目经验',
  '你的技术栈是什么',
  '做过最有挑战的事',
]

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [userId] = useState(() => getUserId())
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mode] = useState<ChatMode>('chat')

  const {
    conversations,
    isLoading: isConversationsLoading,
    fetchConversations,
    createConversation,
    deleteConversation,
  } = useConversations({ userId })

  const { fetchMessages } = useMessages({
    conversationId: activeConversationId,
    userId,
  })

  const {
    messages,
    isLoading: isSending,
    sendMessage,
    abort,
    loadMessages,
    resetMessages,
  } = useChat({
    apiUrl: `${API_BASE_URL}/chat`,
    userId,
    conversationId: activeConversationId,
  })

  const {
    isRecording,
    isRecognizing,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  } = useSpeech({
    apiUrl: API_BASE_URL,
  })

  // 初始化：加载最近会话
  useEffect(() => {
    if (conversations.length > 0 && !activeConversationId) {
      const latest = conversations[0]
      setActiveConversationId(latest.id)
    }
  }, [conversations, activeConversationId])

  // 切换会话时加载消息
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages().then(fetched => {
        loadMessages(fetched)
      })
    } else {
      resetMessages()
    }
  }, [activeConversationId, fetchMessages, loadMessages, resetMessages])

  const showQuickQuestions = mode === 'chat' && messages.length === 0

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setActiveConversationId(conversation.id)
  }, [])

  const handleNewConversation = useCallback(async () => {
    const conversation = await createConversation()
    if (conversation) {
      setActiveConversationId(conversation.id)
      resetMessages()
      setShowSidebar(false)
    }
  }, [createConversation, resetMessages])

  const handleDeleteConversation = useCallback(async (id: string) => {
    const success = await deleteConversation(id)
    if (success) {
      if (activeConversationId === id) {
        setActiveConversationId(null)
        resetMessages()
      }
    }
  }, [deleteConversation, activeConversationId, resetMessages])

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isSending) return

    // 如果没有当前会话，先创建一个
    if (!activeConversationId) {
      const conversation = await createConversation()
      if (!conversation) return
      setActiveConversationId(conversation.id)
    }

    await sendMessage(text)

    // 刷新会话列表，更新标题和消息数
    fetchConversations()
  }, [activeConversationId, createConversation, fetchConversations, isSending, sendMessage])

  const handleToggleVoice = useCallback(async () => {
    if (isRecognizing) return

    if (isRecording) {
      const text = await stopRecording()
      if (text) {
        handleSend(text)
      }
    } else {
      const started = await startRecording()
      if (!started) {
        alert('无法访问麦克风，请检查浏览器权限设置')
      }
    }
  }, [isRecording, isRecognizing, startRecording, stopRecording, handleSend])

  // 数字人模式下，AI 回复完成后自动语音播报
  const lastSpokenIndexRef = useRef<number>(-1)
  const speakingIndexRef = useRef<number | null>(null)
  const prevModeRef = useRef<ChatMode>(mode)
  const prevConversationIdRef = useRef<string | null>(activeConversationId)

  // 统一管理数字人模式下的语音播报：
  // 1. 首次进入数字人模式或切换会话时，先停止播放并把已播报位置同步为最后一条 assistant 消息
  // 2. 已在数字人模式下时，当 AI 回复完成且是新的 assistant 消息，自动调用 TTS
  // 合并为一个 effect 可避免两个 effect 因执行顺序导致历史消息被重复播报
  useEffect(() => {
    if (mode !== 'digital-human') {
      prevModeRef.current = mode
      prevConversationIdRef.current = activeConversationId
      return
    }

    const modeJustSwitched = prevModeRef.current !== 'digital-human'
    const conversationChanged = activeConversationId !== prevConversationIdRef.current

    if (modeJustSwitched || conversationChanged) {
      stopSpeaking()
      speakingIndexRef.current = null
      const lastAssistantIndex = messages.reduce((idx, msg, i) => (msg.role === 'assistant' ? i : idx), -1)
      lastSpokenIndexRef.current = lastAssistantIndex
    } else {
      const lastIndex = messages.length - 1
      const lastMessage = messages[lastIndex]
      if (
        !isSending &&
        lastMessage?.role === 'assistant' &&
        lastIndex > lastSpokenIndexRef.current &&
        speakingIndexRef.current !== lastIndex
      ) {
        lastSpokenIndexRef.current = lastIndex
        speakingIndexRef.current = lastIndex
        speak(lastMessage.content).then(() => {
          if (speakingIndexRef.current === lastIndex) {
            speakingIndexRef.current = null
          }
        })
      }
    }

    prevModeRef.current = mode
    prevConversationIdRef.current = activeConversationId
  }, [mode, activeConversationId, isSending, messages, speak, stopSpeaking])

  const activeTitle = useMemo(() => {
    const active = conversations.find(c => c.id === activeConversationId)
    return active?.title || '面试 AI 助手'
  }, [conversations, activeConversationId])

  return (
    <div className="tw-w-[400px] tw-h-[520px] tw-flex tw-flex-col tw-bg-white tw-rounded-xl tw-shadow-2xl tw-border tw-border-gray-200 max-md:tw-fixed max-md:tw-inset-0 max-md:tw-w-full max-md:tw-h-full max-md:tw-rounded-none">
      {/* Header */}
      <div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-py-3 tw-border-b tw-border-gray-200 tw-bg-[#1B365D] tw-rounded-t-xl max-md:tw-rounded-t-none">
        <div className="tw-flex tw-items-center tw-gap-2 tw-min-w-0">
          {mode !== 'select' && (
            <button
              onClick={() => setShowSidebar(prev => !prev)}
              className="tw-text-white/70 hover:tw-text-white tw-transition tw-p-1 tw-rounded hover:tw-bg-white/10"
              title="会话列表"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          <span className="tw-text-lg">🤖</span>
          <span className="tw-text-white tw-font-medium tw-text-sm tw-truncate">
            {mode === 'select' ? '选择面试模式' : activeTitle}
          </span>
        </div>
        <div className="tw-flex tw-items-center tw-gap-1">
          {/* 数字人模式入口已隐藏，默认使用对话模式
          {mode !== 'select' && (
            <button
              onClick={() => setMode(mode === 'chat' ? 'digital-human' : 'chat')}
              className="tw-text-white/70 hover:tw-text-white tw-transition tw-p-1.5 tw-rounded hover:tw-bg-white/10"
              title={mode === 'chat' ? '切换到数字人模式' : '切换到对话模式'}
            >
              {mode === 'chat' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </button>
          )} */}
          <button
            onClick={onClose}
            className="tw-text-white/70 tw-transition hover:tw-text-white tw-text-xl tw-leading-none tw-w-7 tw-h-7 tw-flex tw-items-center tw-justify-center tw-rounded hover:tw-bg-white/10"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="tw-flex-1 tw-flex tw-overflow-hidden">
        {/* mode === 'select' ? (
          <ModeSelector onSelect={selected => setMode(selected)} />
        ) : ( */}
          <>
            {/* Sidebar */}
            {showSidebar && (
              <div className="tw-w-[160px] tw-flex tw-flex-col tw-border-r tw-border-gray-200 tw-bg-gray-50">
                <div className="tw-px-3 tw-py-2 tw-text-xs tw-text-gray-400 tw-font-medium">
                  历史对话
                </div>
                <ConversationList
                  conversations={conversations}
                  activeId={activeConversationId}
                  isLoading={isConversationsLoading}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
                <NewChatButton onClick={handleNewConversation} />
              </div>
            )}

            {/* Main content */}
            {mode === 'chat' ? (
              <div className="tw-flex-1 tw-flex tw-flex-col tw-min-w-0">
                {showQuickQuestions ? (
                  <div className="tw-flex-1 tw-flex tw-flex-col tw-items-center tw-justify-center tw-px-6 tw-gap-4">
                    <div className="tw-text-center tw-mb-2">
                      <span className="tw-text-3xl tw-mb-2 tw-block">👋</span>
                      <p className="tw-text-gray-600 tw-text-sm">你好！我是面试 AI 助手，可以回答关于候选人的问题。</p>
                    </div>
                    <div className="tw-flex tw-flex-col tw-gap-2 tw-w-full">
                      {QUICK_QUESTIONS.map(q => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="tw-w-full tw-text-left tw-px-4 tw-py-2.5 tw-text-sm tw-bg-[#EEF2F7] tw-text-[#1B365D] tw-rounded-lg tw-transition hover:tw-bg-[#dce4ed] tw-border tw-border-transparent hover:tw-border-[#1B365D]/20"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <MessageList messages={messages} isLoading={isSending} />
                )}

                <ChatInput
                  onSend={handleSend}
                  onAbort={abort}
                  isLoading={isSending}
                  isRecording={isRecording}
                  isRecognizing={isRecognizing}
                  onToggleVoice={handleToggleVoice}
                />
              </div>
            ) : (
              <DigitalHumanChat
                messages={messages}
                isLoading={isSending}
                onSend={handleSend}
                onAbort={abort}
                isRecording={isRecording}
                isRecognizing={isRecognizing}
                onToggleVoice={handleToggleVoice}
              />
            )}
          </>
        {/* ) } */}
      </div>
    </div>
  )
}
