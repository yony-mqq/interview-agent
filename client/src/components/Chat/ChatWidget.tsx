import { useState, useCallback } from 'react'
import { ChatPanel } from './ChatPanel'
import { AuthGate } from '../AuthGate'
import { useAuth } from '../../hooks/useAuth'

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const { isAuthenticated, isLoading, accessEnabled, refresh } = useAuth()

  const handleOpen = () => {
    setIsOpen(true)
  }

  const handleAuthenticated = useCallback(() => {
    refresh()
  }, [refresh])

  const showAuthGate = isOpen && !isLoading && accessEnabled !== false && !isAuthenticated
  const showChatPanel = isOpen && !showAuthGate

  return (
    <div className="tw-fixed tw-bottom-6 tw-right-6 tw-z-50 print:tw-hidden">
      {showChatPanel ? (
        <ChatPanel onClose={() => setIsOpen(false)} />
      ) : (
        <button
          onClick={handleOpen}
          className="tw-flex tw-items-center tw-gap-2.5 tw-pl-4 tw-pr-5 tw-py-3 tw-rounded-full tw-bg-[#1B365D] tw-text-white tw-shadow-xl tw-shadow-[#1B365D]/30 tw-transition-all tw-duration-300 tw-cursor-pointer hover:tw-bg-[#152a4a] hover:tw-scale-105"
          aria-label="打开面试 AI 助手"
        >
          <span className="tw-relative tw-flex tw-h-2.5 tw-w-2.5">
            <span className="tw-absolute tw-inline-flex tw-h-full tw-w-full tw-animate-ping tw-rounded-full tw-bg-green-400 tw-opacity-75" />
            <span className="tw-relative tw-inline-flex tw-rounded-full tw-h-2.5 tw-w-2.5 tw-bg-green-500" />
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="tw-text-sm tw-font-bold tw-whitespace-nowrap">AI 面试</span>
        </button>
      )}

      {showAuthGate && (
        <AuthGate onAuthenticated={handleAuthenticated} />
      )}
    </div>
  )
}
