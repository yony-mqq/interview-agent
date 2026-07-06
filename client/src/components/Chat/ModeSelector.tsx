interface ModeSelectorProps {
  onSelect: (mode: 'chat' | 'digital-human') => void;
}

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="tw-flex-1 tw-flex tw-flex-col tw-items-center tw-justify-center tw-px-6 tw-gap-5">
      <div className="tw-text-center">
        <span className="tw-text-3xl tw-mb-2 tw-block">🤖</span>
        <p className="tw-text-gray-800 tw-font-medium tw-text-sm">选择面试助手模式</p>
        <p className="tw-text-gray-500 tw-text-xs tw-mt-1">可随时在顶部切换</p>
      </div>

      <div className="tw-flex tw-flex-col tw-gap-3 tw-w-full">
        <button
          onClick={() => onSelect('chat')}
          className="tw-group tw-w-full tw-flex tw-items-center tw-gap-3 tw-text-left tw-px-4 tw-py-3 tw-bg-white tw-border tw-border-gray-200 tw-rounded-xl tw-transition hover:tw-border-[#1B365D] hover:tw-shadow-md hover:tw-bg-[#F8FAFC]"
        >
          <div className="tw-w-10 tw-h-10 tw-rounded-full tw-bg-[#EEF2F7] tw-flex tw-items-center tw-justify-center tw-text-[#1B365D] group-hover:tw-bg-[#1B365D] group-hover:tw-text-white tw-transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="tw-flex-1">
            <div className="tw-text-sm tw-font-medium tw-text-gray-800">对话模式</div>
            <div className="tw-text-xs tw-text-gray-500">传统文字对话，快速高效</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tw-text-gray-300 group-hover:tw-text-[#1B365D] tw-transition">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button
          onClick={() => onSelect('digital-human')}
          className="tw-group tw-w-full tw-flex tw-items-center tw-gap-3 tw-text-left tw-px-4 tw-py-3 tw-bg-white tw-border tw-border-gray-200 tw-rounded-xl tw-transition hover:tw-border-[#1B365D] hover:tw-shadow-md hover:tw-bg-[#F8FAFC]"
        >
          <div className="tw-w-10 tw-h-10 tw-rounded-full tw-bg-[#EEF2F7] tw-flex tw-items-center tw-justify-center tw-text-[#1B365D] group-hover:tw-bg-[#1B365D] group-hover:tw-text-white tw-transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="tw-flex-1">
            <div className="tw-text-sm tw-font-medium tw-text-gray-800">数字人模式</div>
            <div className="tw-text-xs tw-text-gray-500">沉浸式面试，拟真互动体验</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tw-text-gray-300 group-hover:tw-text-[#1B365D] tw-transition">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
